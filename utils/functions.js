const fs = require('fs');
const Excel = require('exceljs');
const path = require('node:path');
const https = require('node:https');
const puppeteer = require('puppeteer');
const randomUseragent = require('random-useragent');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { promises } = require('dns');
const { time } = require('console');
const sqlite3 = require('sqlite3').verbose();
const { DateTime } = require('luxon');
const { DEFAULT_TIMEZONE } = require('../config.js');

// Convert local time to UTC (returns format "HH:mmZ")
function localToUTC(localHour, timezone = DEFAULT_TIMEZONE) {
    const [hours, minutes] = localHour.split(':').map(Number);
    const localTime = DateTime.now()
        .setZone(timezone)
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
    return localTime.toUTC().toFormat('HH:mm') + 'Z';
}

// Convert UTC time to local time (accepts "HH:mm" or "HH:mmZ")
function utcToLocal(utcHour, timezone = DEFAULT_TIMEZONE) {
    // Remove 'Z' suffix if present
    const cleanHour = utcHour.endsWith('Z') ? utcHour.slice(0, -1) : utcHour;
    const [hours, minutes] = cleanHour.split(':').map(Number);
    const utcTime = DateTime.utc()
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
    return utcTime.setZone(timezone).toFormat('HH:mm');
}

// Load registered clans from the database
async function loadRegisteredClans() {
    clansDict = {}
    try {
        // Open the database
        let db = new sqlite3.Database('./db/OPM.sqlite3', sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error(err.message);
            }
        });

        db.all('SELECT Guild, Name, Abbr, Tag FROM Clans', [], (err, rows) => {
            if (err) {
                throw err;
            }
            registeredClans = rows.map(row => {
                clansDict[row.Name] = row.Tag
                clansDict[row.Tag] = row.Name
                return { guild: row.Guild, name: row.Name, abbr: row.Abbr, tag: row.Tag };
            });

            console.log("\nRegistered clans :")
            console.log(registeredClans);

            // console.log("\nClans dict :")
            // console.log(clansDict);
        });

        // Close the database
        db.close((err) => {
            if (err) {
                console.error(err.message);
            }
        });
    } catch (err) {
        console.error(err);
    }
}

// Function to check if the tag is valid
async function isValidTag(tag) {
    const regex = /\#[a-zA-Z0-9]{8,9}\b/g
    if (tag.search(regex) >= 0) {
        tag = (tag[0] == "#") ? tag : "#" + tag;
        try {
            const statusCode = await http_head("/clan/" + tag.substring(1));
            // console.log('Status Code:', statusCode);
            if (statusCode == 200)
                clan = tag;
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

// Function to check if the clan is registered
function isRegisteredClan(bot, interaction, channel, tag) {
    if (clansDict[tag] == undefined) // Check if the clan is registered
    {
        errorEmbed(bot, interaction, channel, "The clan is not registered !")
        return false
    }
    return true
}

// Function to send an error embed
function errorEmbed(bot, interaction, channel, error) {
    let myError = ""
    let title = ""
    if (typeof (error) == "string") {
        myError = error
        title = "Error"
    }
    else {
        myError = error.response?.status + ' ' + error.response?.statusText
        title = "CR-API Error"
    }
    console.log(`\x1b[31m[${new Date().toISOString()}] ` + title + " : \x1b[0m" + myError)
    const errorEmbed = new EmbedBuilder()
    errorEmbed
        .setColor(0x7C0404)
        .setTitle(title)
        .setDescription(myError)
        .setAuthor({ name: bot.user.tag, iconURL: 'https://cdn.discordapp.com/avatars/' + bot.user.id + '/' + bot.user.avatar + '.png' })
        .setThumbnail('https://cdn.discordapp.com/attachments/527820923114487830/1071116873321697300/png_20230203_181427_0000.png')
        .setTimestamp()
        .setImage('https://media.tenor.com/xEfTylb0-A4AAAAM/sad.gif')
        .setFooter({ text: 'by OPM | Féfé ⚡', iconURL: 'https://avatars.githubusercontent.com/u/94113911?s=400&v=4' });
    if (interaction != null)
        interaction.editReply({ embeds: [errorEmbed] });
    else
        channel.send({ embeds: [errorEmbed] });
}

function generateEmbed(bot) {
    const embed = new EmbedBuilder();
    const rand = Math.random().toString(36).slice(2); // Generate a random string to avoid the image cache
    embed
        .setColor(0x7C0404)
        .setAuthor({ name: bot.user.tag, iconURL: 'https://cdn.discordapp.com/avatars/' + bot.user.id + '/' + bot.user.avatar + '.png' })
        .setThumbnail('https://cdn.discordapp.com/attachments/527820923114487830/1071116873321697300/png_20230203_181427_0000.png')
        .setTimestamp()
        .setFooter({ text: 'by OPM | Féfé ⚡', iconURL: 'https://avatars.githubusercontent.com/u/94113911?s=400&v=4?' + rand });
    return embed
}

// Function to calculate the ratio of fame over decks remaining
async function ratio(RiverRace, decksRemaining, i) {
    let clan
    if (i > -1) clan = RiverRace.clans[i]
    else clan = RiverRace.clan
    // Calculate the ratio depending on the day and hour during Colosseum
    if (RiverRace.periodType == "colosseum") {
        // Get current time in the default timezone (Paris)
        const now = DateTime.now().setZone(DEFAULT_TIMEZONE);
        const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const day = weekday[now.weekday === 7 ? 0 : now.weekday] // Luxon: 1=Monday, 7=Sunday; weekday array: 0=Sunday
        // Subtract 1 minute to not apply the new ratio during end war day report
        const hour = now.minus({ minutes: 1 }).toFormat('HH:mm')
        // Read the war hour from the db
        let warHour = ""
        try {
            // Open the database
            let db = new sqlite3.Database('./db/OPM.sqlite3', sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    console.error(err.message);
                }
            });

            await new Promise((resolve, reject) => {
                db.each(`SELECT * FROM Reports WHERE Clan = "${RiverRace.clan.tag}"`, (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        warHour = row.Hour
                    }
                }, (err, count) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            // Close the database
            db.close((err) => {
                if (err) {
                    console.error(err.message);
                }
            });
        } catch (err) {
            console.error(err);
        }

        // Convert UTC hour from database to local time for comparison
        const warHourLocal = utcToLocal(warHour);

        // console.log(`[DEBUG ratio] day=${day}, hour=${hour}, warHour=${warHour}, warHourLocal=${warHourLocal}, decksRemaining=${decksRemaining}`);

        if ((day == "Thursday" && hour > warHourLocal) || (day == "Friday" && hour < warHourLocal)) {
            ratio = (clan.fame / (200 - decksRemaining)).toFixed(2).toString()
            // console.log(`[DEBUG ratio] Day 1 (Thu after reset → Fri before reset): ratio=${ratio} (200 - ${decksRemaining})`)
        }
        if ((day == "Friday" && hour > warHourLocal) || (day == "Saturday" && hour < warHourLocal)) {
            ratio = (clan.fame / (400 - decksRemaining)).toFixed(2).toString()
            // console.log(`[DEBUG ratio] Day 2 (Fri after reset → Sat before reset): ratio=${ratio} (400 - ${decksRemaining})`)
        }
        if ((day == "Saturday" && hour > warHourLocal) || (day == "Sunday" && hour < warHourLocal)) {
            ratio = (clan.fame / (600 - decksRemaining)).toFixed(2).toString()
            // console.log(`[DEBUG ratio] Day 3 (Sat after reset → Sun before reset): ratio=${ratio} (600 - ${decksRemaining})`)
        }
        if ((day == "Sunday" && hour > warHourLocal) || (day == "Monday" && hour < warHourLocal)) {
            ratio = (clan.fame / (800 - decksRemaining)).toFixed(2).toString()
            // console.log(`[DEBUG ratio] Day 4 (Sun after reset → Mon before reset): ratio=${ratio} (800 - ${decksRemaining})`)
        }
    }
    else {
        if (decksRemaining == 200)
            ratio = 0.00.toFixed(2).toString()
        else
            ratio = (clan.periodPoints / (200 - decksRemaining)).toFixed(2).toString()
    }
    return ratio
}

// Function to choose the emote depending on the ratio
function ratioEmote(ratio) {
    let ratioEmote = "<a:Green_battery:1186367109073227837>"
    if (ratio < 170)
        ratioEmote = "<:Battery_yellow:1186367121966506116>"
    if (ratio < 160)
        ratioEmote = "<a:Battery_low:1186367126756393042>"
    return ratioEmote
}

// Function to fetch the clan's war history directly from the Supercell API not using the @varandas/clash-royale-api package (not available in it)
async function fetchHist(tag) {
    try {
        const response = await fetch("https://api.clashroyale.com/v1/clans/%23" + tag + "/riverracelog", {
            headers: {
                authorization: `Bearer ${process.env.CR_TOKEN}`,
            },
        });
        const jsonData = await response.json();
        return jsonData;
    } catch (error) {
        console.log("CR-API error : ", error)
        return error;
    }
}

// Function to generate an HTML table from an Excel worksheet
function generateHtmlTableFromWorksheet(worksheet, family) {
    let html = '<table style="border-collapse: collapse; border: 1px solid black;">\n';

    worksheet.eachRow((row, rowNumber) => {
        if (family) {
            html += '<tr style="border-top: 1px solid black; border-bottom: 1px solid black;">\n';
        }
        else {
            if (rowNumber % 2 == 0) {
                html += '<tr style="border-top: 1px solid black;">\n';
            } else {
                html += '<tr style="border-bottom: 1px solid black;">\n';
            }
        }
        row.eachCell({ includeEmpty: true }, (cell) => {
            // console.log(cell);
            if (cell.type == 0) { // Empty cell -> add an empty cell in the HTML table
                html += `<td> </td>\n`;
            }
            else {
                let cellColor = null;
                if (cell.fill && cell.fill.fgColor && cell.fill.fgColor.argb) {
                    cellColor = cell.fill.fgColor.argb.substring(2);
                }
                const cellValue = cell.text || '';
                if (cell._mergeCount === 1 && cell.type != 1) { // Vertical merged cell
                    html += `<td style="background-color:#${cellColor}; text-align: center; border-right: 1px solid black; white-space: nowrap; padding-left: 10px; padding-right: 10px;" rowspan="2">${cellValue}</td>\n`;
                } else if (cell._mergeCount === 0 && cell.type == 1) {
                    // Skip the cell if it is part of a merged cell
                } else if (family) {
                    html += `<td style="background-color:#${cellColor}; text-align: center; border-right: 1px solid black; white-space: nowrap; padding-left: 10px; padding-right: 10px;">${cellValue}</td>\n`;
                } else {
                    html += `<td style="background-color:#${cellColor}; text-align: center; white-space: nowrap; padding-left: 10px; padding-right: 10px;">${cellValue}</td>\n`;
                }
            }
        });
        html += '</tr>\n';
    });

    html += '</table>\n';

    return html;
}

// Function to initialize Puppeteer depending on the OS
async function puppeteerInit() {
    const baseArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--user-agent=${randomUseragent.getRandom()}`
    ];

    if (process.env.NIXPKGS_CONFIG) { // Check if the script is running on NixOS to not install chromium because it is not allowed by NixOS
        return await puppeteer.launch({
            headless: 'new',
            executablePath: '/run/current-system/sw/bin/google-chrome-stable',
            args: baseArgs
        });
    } else if (process.env.PUPPETEER_EXECUTABLE_PATH) { // Check if running in Docker
        return await puppeteer.launch({
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: baseArgs
        });
    } else {
        return await puppeteer.launch({
            headless: 'new',
            args: baseArgs
        });
    }
}

// Function to read the Excel file and convert the first sheet to a PNG image
async function exportSheetToPNG(inputFilePath, pngPath, family) {
    const workbook = new Excel.Workbook();
    await workbook.xlsx.readFile(inputFilePath);
    const worksheet = workbook.worksheets[0];

    // Convert the worksheet to an HTML table
    const table = generateHtmlTableFromWorksheet(worksheet, family);

    const browser = await puppeteerInit();
    const page = await browser.newPage();

    // Navigate to a blank HTML page
    await page.goto('about:blank');

    // Inject the HTML content into the page
    await page.evaluate((content) => {
        document.body.innerHTML = content;
    }, table);

    // Get the dimensions of the rendered table
    const { width, height } = await page.evaluate(() => {
        const table = document.querySelector('table');
        return {
            width: table.offsetWidth + 20,
            height: table.offsetHeight + 20,
        };
    });

    // Set the viewport size based on the width and height
    await page.setViewport({ width, height });

    // Capture a screenshot of the rendered content
    await page.screenshot({ path: pngPath });

    await browser.close();

    // console.log('Image exported successfully.');
}

// Function to hash a string to an HTML color
function hashStringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const r = (hash & 0xFF0000) >> 16 | 0x80;
    const g = (hash & 0x00FF00) >> 8;
    const b = hash & 0x0000FF | 0x80;
    color = `#${('00' + r.toString(16)).slice(-2)}${('00' + g.toString(16)).slice(-2)}${('00' + b.toString(16)).slice(-2)}`;
    // console.log(str, color);
    return color;
}

// Function to generate an Excel file from the scores
async function excel(scores, fileName, family = false) {
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Averages');
    let avgColumns = [];
    if (!family) {
        avgColumns = [
            { key: 'clan', header: 'Clan' },
            { key: 'player', header: 'Player name' },
            { key: 'fame', header: 'Average' },
            { key: 'role', header: 'Role' },
            { key: 'expLevel', header: 'Exp level' },
            { key: 'week1', header: 'Week -1' },
            { key: 'week2', header: 'Week -2' },
            { key: 'week3', header: 'Week -3' },
            { key: 'week4', header: 'Week -4' },
            { key: 'week5', header: 'Week -5' },
            { key: 'week6', header: 'Week -6' },
            { key: 'week7', header: 'Week -7' },
            { key: 'week8', header: 'Week -8' },
            { key: 'week9', header: 'Week -9' },
            { key: 'week10', header: 'Week -10' },
        ];
    } else {
        avgColumns = [
            { key: 'clan', header: 'Clan' },
            { key: 'player', header: 'Player name' },
            { key: 'fame', header: 'Average' },
            { key: 'role', header: 'Role' },
            { key: 'expLevel', header: 'Exp level' },
            { key: 'targetClan', header: 'Target clan' },
            { key: 'movement', header: 'Movement' },
        ];
    }
    let columnsCount = avgColumns.length;

    worksheet.columns = avgColumns;

    for (const key in scores) {
        if (scores[key]['fame'] == 0) continue; // Skip players with no fame
        if (!family) {
            worksheet.addRow({ clan: scores[key]['clan'], player: key, fame: scores[key]['fame'].toFixed(), role: scores[key]['role'] || '', expLevel: scores[key]['expLevel'], week1: scores[key]['array'][0], week2: scores[key]['array'][1], week3: scores[key]['array'][2], week4: scores[key]['array'][3], week5: scores[key]['array'][4], week6: scores[key]['array'][5], week7: scores[key]['array'][6], week8: scores[key]['array'][7], week9: scores[key]['array'][8], week10: scores[key]['array'][9] });
            worksheet.addRow({ clan: scores[key]['clan'], player: key, fame: scores[key]['fame'].toFixed(), role: scores[key]['role'] || '', expLevel: scores[key]['expLevel'], week1: scores[key]['decksUsed'][0], week2: scores[key]['decksUsed'][1], week3: scores[key]['decksUsed'][2], week4: scores[key]['decksUsed'][3], week5: scores[key]['decksUsed'][4], week6: scores[key]['decksUsed'][5], week7: scores[key]['decksUsed'][6], week8: scores[key]['decksUsed'][7], week9: scores[key]['decksUsed'][8], week10: scores[key]['decksUsed'][9] });
            // Merge the 5 first columns
            worksheet.mergeCells(worksheet.rowCount - 1, 1, worksheet.rowCount, 1);
            worksheet.mergeCells(worksheet.rowCount - 1, 2, worksheet.rowCount, 2);
            worksheet.mergeCells(worksheet.rowCount - 1, 3, worksheet.rowCount, 3);
            worksheet.mergeCells(worksheet.rowCount - 1, 4, worksheet.rowCount, 4);
            worksheet.mergeCells(worksheet.rowCount - 1, 5, worksheet.rowCount, 5);
        } else
            worksheet.addRow({ clan: scores[key]['clan'], player: key, fame: scores[key]['fame'].toFixed(), role: scores[key]['role'] || '', expLevel: scores[key]['expLevel'], targetClan: scores[key]['targetClan'], movement: scores[key]['movement'] });
    }

    worksheet.columns.forEach((sheetColumn) => {
        sheetColumn.font = {
            size: 12,
        };
        sheetColumn.alignment = {
            vertical: 'middle',
            horizontal: 'center'
        };
        if (sheetColumn.key == 'player') {
            sheetColumn.width = 25;
            sheetColumn.font = {
                bold: true,
            };
        }
        else if (sheetColumn.key == 'clan' || sheetColumn.key == 'targetClan') {
            sheetColumn.width = 20;
            sheetColumn.font = {
                bold: true,
            };
        }
        else if (sheetColumn.key == 'role') {
            sheetColumn.width = 12;
        }
        else {
            sheetColumn.width = 15;
        }
    });

    // Apply styles to the worksheet headers
    worksheet.getRow(1).font = {
        bold: true,
        size: 13,
    };
    for (let i = 1; i <= columnsCount; i++) {
        const cellToColor = worksheet.getCell(1, i);
        cellToColor.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF949494' } // Gray color
        };
        if (i <= 5) {
            cellToColor.border = {
                ...cellToColor.border,
                right: { style: 'medium' },
            };
        }
    }

    // Apply styles to the worksheet cells
    worksheet.getColumn('C').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        cell.border = {
            left: { style: 'medium' },
            right: { style: 'medium' }
        };
        if (rowNumber > 1 && (family || rowNumber % 2 == 0)) { // Scores lines
            const value = cell.value; // Get the player's average value

            for (let i = 1; i <= columnsCount; i++) {
                const cellToColor = worksheet.getCell(rowNumber, i);
                cellToColor.border = {
                    ...cellToColor.border,
                    top: { style: 'thin' },
                };
                if (cellToColor.value == null) continue; // Skip coloring empty cells
                if (i == 1) { // Current clan name
                    const cellColor = hashStringToColor(cellToColor.value);
                    cellToColor.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: cellColor.replace('#', 'FF') } // Hashed color
                    };
                    cellToColor.border = {
                        ...cellToColor.border,
                        right: { style: 'medium' },
                    };
                } else if (i < 5) { // Player name, fame and role
                    if (value < 2400) {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFD61E1E' } // Red color
                        };
                    } else if (value >= 2400 && value <= 2700) {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE79A2B' } // Orange color
                        };
                    } else {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF18B815' } // Green color
                        };
                    }
                } else if (i == 5) { // Exp level
                    if (cellToColor.value == 0)
                        cellToColor.value = "Out of clan";
                    if (cellToColor.value < 42 || cellToColor.value == "Out of clan") {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFD61E1E' } // Red color
                        };
                    } else if (cellToColor.value >= 42 && cellToColor.value <= 54) {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE79A2B' } // Orange color
                        };
                    } else {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF18B815' } // Green color
                        };
                    }
                    cellToColor.border = {
                        ...cellToColor.border,
                        right: { style: 'medium' },
                    };
                } else if (family && i == 6) { // Target clan
                    if (cellToColor.value) { // Skip coloring empty cells
                        const cellColor = hashStringToColor(cellToColor.value);
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: cellColor.replace('#', 'FF') } // Hashed color
                        };
                    }
                    cellToColor.border = {
                        ...cellToColor.border,
                        right: { style: 'medium' },
                    };
                } else if (family && i == 7) { // Movement
                    // No color
                    cellToColor.border = {
                        ...cellToColor.border,
                        right: { style: 'medium' },
                    };
                } else {
                    if (cellToColor.value < 2400) {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFD61E1E' } // Red color
                        };
                    } else if (cellToColor.value >= 2400 && cellToColor.value <= 2700) {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE79A2B' } // Orange color
                        };
                    } else {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF18B815' } // Green color
                        };
                    }
                };
            }
        }
        else if (rowNumber > 1 && rowNumber % 2 != 0) { // Decks used lines
            for (let i = 1; i <= columnsCount; i++) {
                const cellToColor = worksheet.getCell(rowNumber, i);
                cellToColor.border = {
                    ...cellToColor.border,
                    bottom: { style: 'thin' },
                };
                if (cellToColor.value == null) continue; // Skip coloring empty cells
                if (i == 1) { // Current clan name
                    const cellColor = hashStringToColor(cellToColor.value);
                    cellToColor.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: cellColor.replace('#', 'FF') } // Hashed color
                    };
                    cellToColor.border = {
                        ...cellToColor.border,
                        right: { style: 'medium' },
                    };
                } else if (i > 5) { // Decks used
                    if (cellToColor.value < 16 && cellToColor.value % 4 != 0) {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFD61E1E' } // Red color
                        };
                    } else if (cellToColor.value < 16 && cellToColor.value % 4 == 0) {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE79A2B' } // Orange color
                        };
                    } else {
                        cellToColor.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF18B815' } // Green color
                        };
                    }
                };
            }
        }
    });

    const xlsxPath = path.resolve(__dirname, '../' + fileName + '.xlsx');

    await workbook.xlsx.writeFile(xlsxPath)
        .then(() => {
            // console.log('File saved successfully.');
        })
        .catch((error) => {
            console.error('An error occurred while saving the file:', error);
        });

    const pngPath = fileName + '.png'; // Replace with the desired output image path
    await exportSheetToPNG(xlsxPath, pngPath, family).catch((error) => {
        console.error('An error occurred:', error);
    });
}

async function http_head(tag) {
    // const url = 'https://www.cwstats.com' + tag;
    const url = 'https://www.deckshop.pro/spy' + tag;
    return 200; // Disable tag check temporarily
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
            resolve(res.statusCode);
        });

        req.on('error', (err) => {
            console.error(err);
            reject(err);
        });

        req.end();
    });
}

function base64ToArrayBuffer(base64) {
    var binary_string = Buffer.from(base64, 'base64').toString('binary');
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

async function playerHistory(bot, channel, url) {
    // console.log('Launching Puppeteer...');
    // Launch the browser and open a new blank page
    const browser = await puppeteerInit();
    const page = await browser.newPage();

    // Block requests to specific domains
    const blockedDomains = ['a.pub.network', 'c.pub.network', 'd.pub.network'];

    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (blockedDomains.includes(url.hostname)) {
            request.abort();
        } else {
            request.continue();
        }
    });

    // Navigate the page to a URL
    const response = await page.goto(url);
    // console.log(`Statut de réponse: ${response.status()} ${response.statusText()}`);
    // console.log('Détails de la réponse:', {
    //     status: response.status(),
    //     statusText: response.statusText(),
    //     ok: response.ok(),
    //     url: response.url(),
    //     headers: response.headers(),
    //     fromCache: response.fromCache(),
    //     fromServiceWorker: response.fromServiceWorker()
    // });

    // Save the page source
    // let source = await page.content();
    // fs.writeFileSync('source.html', source);

    // Show the player history
    try {
        await Promise.all([
            page.waitForSelector("button.ui.primary.button.cw2_history_button"),
            page.click("button.ui.primary.button.cw2_history_button"),
        ]);
    }
    catch (error) {
        errorEmbed(bot, null, channel, "Unable to find the `cw2_history_button` on **RoyaleAPI** !\nResponse status: **" + response.status() + " " + response.statusText() + "**");
        await browser.close();
        return false;
    }

    // Wait for the chart to be rendered
    // await new Promise(resolve => setTimeout(resolve, 2200));
    await Promise.all([
        page.waitForSelector("table.ui.very.basic.compact.unstackable.player__cw2_history_table.table"),
    ]);

    // Set screen size
    await page.setViewport({ width: 1080, height: 2048 });

    // Get the base64-encoded image data
    const imageData = await page.$eval("canvas#cw2-history-chart", el => el.toDataURL().substring(22));

    // Convert the base64-encoded data to an ArrayBuffer
    const buffer = base64ToArrayBuffer(imageData);

    // Create a new Uint8Array from the ArrayBuffer
    const uint8Array = new Uint8Array(buffer);

    // Create a new file and write the data to it
    fs.writeFileSync('playerHistoryCanvas.png', uint8Array);

    // Scroll to the canvas element
    await page.evaluate(() => {
        const canvas = document.querySelector("canvas#cw2-history-chart");
        canvas.scrollIntoView();
    });

    // Capture a screenshot of the rendered content
    const pngPath = 'playerHistory.png';
    await page.screenshot({ path: pngPath });

    await browser.close();
    return true;
}

function extractPlayerInfo(str) {
    const regex = /\[([^\]]+)\]\(https:\/\/dspy\.pro\/en\/p\/([^\)]+)\)/;
    const match = str.match(regex);
    if (match) {
        return {
            playerName: match[1],
            playerTag: match[2]
        };
    }
    return null;
}

function extractDeckShopTagFromURL(url) {
    const regex = /https:\/\/www\.deckshop\.pro\/spy\/clan\/([A-Z0-9]+)/;
    const match = url.match(regex);
    if (match) {
        return match[1];
    }
    return null;
}

async function extractDeckShopTag(deckShopMessage) {
    if (deckShopMessage.embeds[0].fields[0].name.search("joined") >= 0) {
        msg = deckShopMessage.embeds[0].fields[0].value
        const playerInfo = extractPlayerInfo(msg);
        clan = '#' + extractDeckShopTagFromURL(deckShopMessage.embeds[0].author.url); // Get the clan tag from the URL shared in the message
        const avg = await fetchHist(clan.substring(1)); // Get the clans' score history
        avgString = JSON.stringify(avg, null, 4) // Convert the JSON object to a string (pretty-printed)
        if (avgString.search(playerInfo.playerTag) > 0) {
            for (let p = 0; p < avg.items.length; p++) {
                for (let h = 0; h < avg.items[p].standings.length; h++) {
                    if (avg.items[p].standings[h].clan.tag == clan) {
                        for (let q = 0; q < avg.items[p].standings[h].clan.participants.length; q++) {
                            let participant = avg.items[p].standings[h].clan.participants[q];
                            if ('#' + playerInfo.playerTag == participant.tag && participant.fame > 0) {
                                return; // The player has already joined the clan in the past
                            }
                        }
                    }
                }
            }
        }
        return '#' + playerInfo.playerTag;
    }
}

async function renderCommand(interaction, tmpFile, wait) {
    const browser = await puppeteerInit();
    const page = await browser.newPage();

    // Navigate to a blank HTML page
    await page.goto(`file:${path.join(__dirname, '../' + tmpFile)}`);

    // Get background image dimensions to calculate proportional height
    const targetWidth = 2560;

    // Wait a bit for the page to load
    await new Promise(resolve => setTimeout(resolve, 500));

    const backgroundHeight = await page.evaluate((width) => {
        return new Promise((resolve) => {
            const body = document.body;
            const bgImage = window.getComputedStyle(body).backgroundImage;

            // Extract the URL from background-image CSS property
            const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (!urlMatch) {
                resolve(null);
                return;
            }

            const img = new Image();
            img.onload = function () {
                // Calculate proportional height for target width
                const aspectRatio = this.height / this.width;
                resolve(Math.round(width * aspectRatio));
            };
            img.onerror = function () {
                resolve(null);
            };
            img.src = urlMatch[1];
        });
    }, targetWidth);

    // Set the new viewport size with calculated height or fallback
    const viewportHeight = backgroundHeight || 3624;
    await page.setViewport({ width: targetWidth, height: viewportHeight });

    // Wait for the chart to be rendered
    await new Promise(resolve => setTimeout(resolve, wait));

    // Capture a screenshot of the rendered content
    await page.screenshot({ path: tmpFile + ".png", fullPage: true, quality: 100, type: 'jpeg' });

    await browser.close();

    // Send the image to the channel
    const attachment = new AttachmentBuilder(tmpFile + ".png");
    await interaction.editReply({ files: [attachment] });

    // Delete the temporary files
    fs.unlinkSync('./' + tmpFile);
    fs.unlinkSync('./' + tmpFile + '.png');
}

function barChart(type, Labels, Datas, seasons, max) {
    let scales = {}
    if (type == 'bar')
        scales = {
            yAxes: [{
                ticks: {
                    beginAtZero: true,
                    max: max,
                },
            }],
        };
    else if (type == 'horizontalBar')
        scales = {
            xAxes: [{
                ticks: {
                    beginAtZero: true,
                    max: max,
                },
            }],
        };

    const initialDataset = {
        label: 'Medals',
        data: [],
        backgroundColor: ['rgba(255, 99, 132, 0.2)', 'rgba(75, 192, 192, 0.2)', 'rgba(255, 159, 64, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(255, 205, 86, 0.2)'],
        borderColor: ['rgb(255, 99, 132)', 'rgb(75, 192, 192)', 'rgb(255, 159, 64)', 'rgb(54, 162, 235)', 'rgb(255, 205, 86)'],
        borderWidth: 1,
    };

    let Dataset = [JSON.parse(JSON.stringify(initialDataset))]; // Clone the initial dataset to initialize the array

    if (Datas.length == 1)
        Dataset[0].data = Datas[0]
    else
        for (let i = 0; i < Datas.length; i++) {
            if (i >= Dataset.length)
                Dataset.push(JSON.parse(JSON.stringify(initialDataset))); // Clone the initial dataset
            Dataset[i].data = Datas[i]
            if (seasons)
                Dataset[i].label = "Season " + seasons[i]
            Dataset[i].backgroundColor = initialDataset.backgroundColor[i]
            Dataset[i].borderColor = initialDataset.borderColor[i]
        }

    const chart = {
        type: type,
        data: {
            labels: Labels,
            datasets: Dataset,
        },
        options: {
            'scales': scales,
            plugins:
                [
                    {
                        datalabels: {
                            anchor: 'end',
                            align: 'top',
                            formatter: Math.round,
                            font: {
                                weight: 'bold',
                                size: 16
                            }
                        }
                    },
                    // {
                    //     legend: {
                    //         display: false,
                    //     }
                    // }
                ]
        },
    };
    if (seasons)
        chart.options.plugins = null // Remove the data labels if seasons are defined because there is not enough space to display them
    return chart;
}

module.exports = {
    loadRegisteredClans,
    isValidTag,
    isRegisteredClan,
    errorEmbed,
    generateEmbed,
    ratio,
    ratioEmote,
    fetchHist,
    excel,
    http_head,
    playerHistory,
    extractDeckShopTag,
    renderCommand,
    barChart,
    localToUTC,
    utcToLocal
}
