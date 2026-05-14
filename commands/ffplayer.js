const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const functions = require('../utils/functions.js');

// Minimum season limit: no data should be returned before this season
const MIN_SEASON = { season: 73, section: 0 };

function isSeasonAtOrAfterMinimum(seasonId, sectionIndex) {
    if (seasonId < MIN_SEASON.season) return false;
    if (seasonId === MIN_SEASON.season && sectionIndex < MIN_SEASON.section) return false;
    return true;
}

function getLeagueIconMarkup(row, leagueIcons) {
    const leagueKey = row?.clan_league || '';

    const iconUrl = (leagueKey && leagueIcons ? leagueIcons[leagueKey] : null);

    if (!iconUrl) {
        return functions.escapeHtml(leagueKey || 'N/A');
    }

    const altText = functions.escapeHtml(leagueKey || 'league');
    return `<img src="${functions.escapeHtml(iconUrl)}" alt="${altText}" style="height: 42px; vertical-align: middle;">`;
}

function buildCw2HistoryTableRow(row, leagueIcons) {
    const seasonOffset = row?.season_id !== undefined && row?.section_index !== undefined
        ? `${row.season_id}-${Number(row.section_index) + 1}`
        : 'N/A';

    const date = functions.escapeHtml(row?.log_date ?? 'N/A');
    const league = getLeagueIconMarkup(row, leagueIcons);
    const clanName = functions.escapeHtml(row?.clan_name ?? 'N/A');
    const rank = functions.escapeHtml(row?.clan_rank ?? row?.clan_rank_int ?? 'N/A');
    const decksUsed = functions.escapeHtml(row?.decks_used ?? 'N/A');
    const fame = functions.escapeHtml(row?.fame ?? 'N/A');
    const boatAttacks = functions.escapeHtml(row?.boat_attack ?? 'N/A');

    return `<tr>
        <td>${functions.escapeHtml(seasonOffset)}</td>
        <td>${date}</td>
        <td>${league}</td>
        <td>${clanName}</td>
        <td>${rank}</td>
        <td>${decksUsed}</td>
        <td>${fame}</td>
        <td>${boatAttacks}</td>
    </tr>`;
}

function chunkRows(rows, chunkSize) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += chunkSize) {
        chunks.push(rows.slice(index, index + chunkSize));
    }
    return chunks;
}

function buildCw2FameHistogramConfig(rows, playerName = 'this player', playerTag = '') {
    const reversedRows = [...rows].reverse();
    const labels = reversedRows.map(row => `${row?.season_id ?? 'N/A'}-${Number(row?.section_index ?? 0) + 1}`);
    const fameValues = reversedRows.map(row => Number(row?.fame ?? 0));
    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Fame',
                data: fameValues,
                backgroundColor: 'rgba(222, 34, 34, 0.8)',
                borderColor: 'rgba(222, 34, 34, 1)',
                borderWidth: 1,
                barPercentage: 0.9,
                categoryPercentage: 1.0,
            }],
        },
        options: {
            legend: { display: false },
            title: {
                display: true,
                text: `CW2 history of ${playerName} ${playerTag}`,
                fontSize: 20,
            },
            scales: {
                xAxes: [{
                    ticks: {
                        autoSkip: true,
                        maxRotation: 90,
                        minRotation: 90,
                        maxTicksLimit: 40,
                    },
                    gridLines: {
                        display: false,
                    },
                }],
                yAxes: [{
                    ticks: {
                        beginAtZero: true,
                        max: 3600,
                    },
                }],
            },
        },
    };
}

function buildCw2HistoryHtml(rows, playerName, playerTag, leagueIcons, pageNumber = 1, totalPages = 1) {
    const tableRows = rows.map(row => buildCw2HistoryTableRow(row, leagueIcons)).join('\n');
    const escapedPlayerName = functions.escapeHtml(playerName || 'this player');
    const escapedPlayerTag = functions.escapeHtml(playerTag || '');

    return `
<div style="position: relative; width: 65%; text-align: center; margin: auto;">
    <br><br><br>
    <h1 style="margin-bottom: 1.3em;">CW2 history of <b>${escapedPlayerName}</b> ${escapedPlayerTag}</h1>
    <h2 style="margin-bottom: 3em;">Page ${pageNumber}/${totalPages}</h2>
    <table style="width: 100%; margin: auto; font-size: 2.4em;">
        <tr>
            <th>Season</th>
            <th>Date</th>
            <th>League</th>
            <th>Clan name</th>
            <th>Clan rank</th>
            <th>Decks used</th>
            <th>Fame</th>
            <th>Boat attacks</th>
        </tr>
        ${tableRows}
    </table>
    <br><br><br><br>
    <p style="text-align: left; display: flex; align-items: center; font-size: 2.25em; margin-bottom: 12em;">
        <span style="padding: 10 px;">By <b>OPM I Féfé ⚡️</b></span>
        <img src="https://avatars.githubusercontent.com/u/94113911?s=400&v=4" height="30 px">
    </p>
</div>`;
}

async function sendCw2HistoryRows(bot, channel, apiResult, limit = 60) {
    const payload = apiResult?.json ?? apiResult;

    if (!payload) {
        await channel.send('No CW2 data available.');
        return false;
    }

    if (payload.error) {
        await channel.send(`Unable to fetch CW2 history: ${payload.error}`);
        return false;
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const firstRowPlayerName = rows[0]?.player_name;
    const playerName = decodeURIComponent(payload.player_name || firstRowPlayerName || '').replaceAll('+', ' ').trim();
    const playerTag = payload.player_tag ? `#${payload.player_tag}` : '';

    // Filter rows to only include seasons at or after MIN_SEASON
    const filteredRows = rows.filter(row => isSeasonAtOrAfterMinimum(row?.season_id, row?.section_index));

    const maxRows = limit === -1 ? filteredRows.length : (Number.isFinite(limit) && limit > 0 ? limit : 60);
    const limitedRows = filteredRows.slice(0, maxRows);

    if (!limitedRows.length) {
        await channel.send(`No CW2 results for **${playerName || 'this player'}** ${playerTag}.`);
        return true;
    }

    const chartConfig = buildCw2FameHistogramConfig(filteredRows, playerName, playerTag);
    const chartResponse = await fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            width: 2200,
            height: 700,
            format: 'png',
            backgroundColor: '#cdd0d5',
            chart: chartConfig,
        }),
    });

    if (!chartResponse.ok) {
        throw new Error(`Unable to generate CW2 chart: ${chartResponse.status} ${chartResponse.statusText}`);
    }

    const chartBuffer = Buffer.from(await chartResponse.arrayBuffer());

    const pageRows = chunkRows(limitedRows, 60);
    const tableFiles = [];

    for (let pageIndex = 0; pageIndex < pageRows.length; pageIndex++) {
        const tmpFile = `tmpfiles/${(Math.random() + 1).toString(36).substring(7)}-${pageIndex + 1}.html`;
        const htmlTemplate = fs.readFileSync('./html/layout.html', 'utf8');
        const fragment = buildCw2HistoryHtml(pageRows[pageIndex], playerName, playerTag, payload.league_icons || {}, pageIndex + 1, pageRows.length);
        let html = htmlTemplate.replace(/{{ body }}/g, fragment);
        html = html.replace(/{{ Background }}/g, 'bg/Background_normal_cropped');

        fs.writeFileSync(`./${tmpFile}`, html, 'utf8');
        const renderTarget = {
            editReply: async ({ files }) => {
                if (!files) {
                    return;
                }

                for (const file of files) {
                    const filePath = file?.attachment;
                    if (typeof filePath !== 'string') {
                        continue;
                    }

                    tableFiles.push({
                        attachment: fs.readFileSync(filePath),
                        name: file.name || `cw2-page-${pageIndex + 1}.png`,
                    });
                }
            }
        };

        await functions.renderCommand(renderTarget, tmpFile, 0);
    }

    return {
        chartAttachment: { attachment: chartBuffer, name: 'cw2-fame-history.png' },
        tableFiles,
    };
}

async function playerHistory(bot, channel, url, limit = 60) {
    // console.log('Launching Puppeteer...');
    // Launch the browser and open a new blank page
    const browser = await functions.puppeteerInit();
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
    // console.log(`Response status: ${response.status()} ${response.statusText()}`);
    // console.log('Response details:', {
    //     status: response.status(),
    //     statusText: response.statusText(),
    //     ok: response.ok(),
    //     url: response.url(),
    //     headers: response.headers(),
    //     fromCache: response.fromCache(),
    //     fromServiceWorker: response.fromServiceWorker()
    // });

    // --- Extract the JWT token from the page scripts and call the cw2_history API ---
    try {
        const playerTag = (new URL(url)).pathname.split('/').filter(Boolean).pop();
        const apiResult = await page.evaluate(async (playerTag) => {
            const jwtRegex = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
            let token = null;
            for (const s of Array.from(document.scripts)) {
                if (s.innerText) {
                    const m = s.innerText.match(jwtRegex);
                    if (m && m.length) { token = m[0]; break; }
                }
            }
            if (!token) {
                const bodyText = (document.documentElement && document.documentElement.innerText) || '';
                const m = bodyText.match(jwtRegex);
                if (m && m.length) token = m[0];
            }
            if (!token) return { error: 'token_not_found' };

            // Same-origin request to avoid CORS issues and reuse cookies/session
            const res = await fetch(`/player/cw2_history/${playerTag}`, {
                headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
            });
            const json = await res.json();
            return { json };
        }, playerTag);

        // console.log('cw2_history call result:', JSON.stringify(apiResult));
        return await sendCw2HistoryRows(bot, channel, apiResult, limit);
    } catch (err) {
        console.error('Error during token extraction or cw2_history request:', err);
    }

    // Save the page source
    // let source = await page.content();
    // fs.writeFileSync('source.html', source);

    // // Show the player history
    // try {
    //     await Promise.all([
    //         page.waitForSelector("button.ui.primary.button.cw2_history_button"),
    //         page.click("button.ui.primary.button.cw2_history_button"),
    //     ]);
    // }
    // catch (error) {
    //     functions.errorEmbed(bot, null, channel, "Unable to find the `cw2_history_button` on **RoyaleAPI** !\nResponse status: **" + response.status() + " " + response.statusText() + "**");
    //     await browser.close();
    //     return false;
    // }

    // // Wait for the chart to be rendered
    // // await new Promise(resolve => setTimeout(resolve, 2200));
    // try {
    //     await Promise.all([
    //         page.waitForSelector("table.ui.very.basic.very.compact.unstackable.player__cw2_history_table.table"),
    //     ]);
    // }
    // catch (error) {
    //     functions.errorEmbed(bot, null, channel, "Unable to find the `player__cw2_history_table` on **RoyaleAPI** !\nResponse status: **" + response.status() + " " + response.statusText() + "**");
    //     await browser.close();
    //     return false;
    // }

    // // Set screen size
    // await page.setViewport({ width: 1080, height: 2048 });

    // // Get the base64-encoded image data
    // const imageData = await page.$eval("canvas#cw2-history-chart", el => el.toDataURL().substring(22));

    // // Convert the base64-encoded data to an ArrayBuffer
    // const buffer = functions.base64ToArrayBuffer(imageData);

    // // Create a new Uint8Array from the ArrayBuffer
    // const uint8Array = new Uint8Array(buffer);

    // // Create a new file and write the data to it
    // fs.writeFileSync('playerHistoryCanvas.png', uint8Array);

    // // Scroll to the canvas element
    // await page.evaluate(() => {
    //     const canvas = document.querySelector("canvas#cw2-history-chart");
    //     canvas.scrollIntoView();
    // });

    // // Capture a screenshot of the rendered content
    // const pngPath = 'playerHistory.png';
    // await page.screenshot({ path: pngPath });

    await browser.close();
}

async function ffplayer(bot, api, interaction, channel, tag) {
    let details = false;
    let limit = 60;
    if (interaction != null) {
        await interaction.deferReply();
        tag = interaction.options.getString('tag').toUpperCase();
        details = interaction.options.getBoolean('details');
        limit = interaction.options.getInteger('limit') ?? 60;
        channel = interaction.channel;
    }
    const playerHistoryUrl = `https://royaleapi.com/player/${tag.substring(1)}`;

    const regex = /\#[a-zA-Z0-9]{6,9}\b/g
    if (tag.search(regex) < 0) { // Prevent the bot from crashing if the tag is invalid
        functions.errorEmbed(bot, interaction, channel, "Invalid tag");
        return
    }

    const playerEmbed = functions.generateEmbed(bot);
    let player_data = "";
    let player = {};
    try {
        player = await api.getPlayerByTag(tag);
    } catch (e) {
        functions.errorEmbed(bot, interaction, channel, e)
        return
    }

    player_data += `<:Hashtag:1186369411439923220> Tag: **${player.tag}**\n`
        + `:mechanic: Role: **${player.role}**\n`
        + `<a:Colored_arrow:1186367114190270516> Clan name: **${player.clan?.name}**\n`
        + `<:Hashtag:1186369411439923220> Clan tag: **${player.clan?.tag}**\n\n`
        + `:trophy: Trophies: **${player.trophies}**\n`
        + `:medal: Best trophies: ${player.bestTrophies}\n`
        + `<:Exp_level:1186623719897051176> Exp Level: **${player.expLevel}**\n`
        + `:old_man: Years played: **${(player.badges[0]?.level != undefined ? player.badges[0].level : 0)}** year` + (player.badges[0]?.level > 1 ? `s` : ``) + `\n`;

    if (interaction && details) {
        player_data += `\nExp Points: ${player.expPoints}\n`
            + `Battle count: ${player.battleCount}\n`
            + `Wins: ${player.wins}\n`
            + `Losses: ${player.losses}\n`
            + `Three crown wins: ${player.threeCrownWins}\n`
            + `Tournament battle count: ${player.tournamentBattleCount}\n`
            + `Total donations: ${player.totalDonations}\n`
            + `Star points: ${player.starPoints}\n`
            + `Exp points:  ${player.expPoints}\n`
            + `Total exp points: ${player.totalExpPoints}\n\n`
            + `Path of legends: \n`
            + `Current path of legends league: ${player.currentPathOfLegendSeasonResult.leagueNumber}\n`
            + `Current path of legends trophies: ${player.currentPathOfLegendSeasonResult.trophies}\n`
            + `Current path of legends rank: ${player.currentPathOfLegendSeasonResult.rank}\n\n`
            + `Best path of legends league: ${player.bestPathOfLegendSeasonResult.leagueNumber}\n`
            + `Best path of legends trophies: ${player.bestPathOfLegendSeasonResult.trophies}\n`
            + `Best path of legends rank: ${player.bestPathOfLegendSeasonResult.rank}\n\n`
            // + `Support cards: \n`
            // + player.supportCards.map(card => ` - ${card.name}: Level ${card.level}`).join('\n') + `\n`
            + `Current favorite card: ${player.currentFavouriteCard.name}\n\n`
            + `Current deck: \n`
            // + player.currentDeck.map(card => ` - ${card.name}, Level: ${card.level}`).join('\n') + `\n`
            + player.currentDeck.map(card => ` - ${card.name}`).join('\n') //+ `\n`
            // + `Current favorite card: ${player.currentFavoriteCard.name}, Level: ${player.currentFavoriteCard.level}\n`
            // + `\n`
            ;
    }

    player_data += `\n\n**RoyaleAPI player link :** \nhttps://royaleapi.com/player/` + tag.substring(1);
    player_data += (player.clan ? `\n\n**RoyaleAPI clan link :** \nhttps://royaleapi.com/clan/${player.clan.tag.substring(1)}` : ``);

    playerEmbed
        .setTitle(player.name)
        .setDescription(player_data)

    const cw2Render = await playerHistory(bot, channel, playerHistoryUrl, limit);

    if (cw2Render?.chartAttachment) {
        playerEmbed.setImage('attachment://cw2-fame-history.png');
    }

    // Send embed with chart
    if (interaction != null) {
        await interaction.editReply({
            embeds: [playerEmbed],
            files: cw2Render?.chartAttachment ? [cw2Render.chartAttachment] : [],
        });
    } else {
        await channel.send({
            embeds: [playerEmbed],
            files: cw2Render?.chartAttachment ? [cw2Render.chartAttachment] : [],
        });
    }

    // Send tables in a separate message below the embed
    if (cw2Render?.tableFiles?.length > 0) {
        await channel.send({
            content: '**CW2 History Table(s)**',
            files: cw2Render.tableFiles,
        });
    }
}

module.exports = {
    ffplayer,
    data: new SlashCommandBuilder()
        .setName('ffplayer')
        .setDescription('Replies the player\'s profile !')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Tag of the Player')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('details')
                .setDescription('Display more details'))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Maximum number of CW2 rows to display, -1 for all (default: 60)')
                .setMinValue(-1)),

    async execute(bot, api, interaction) {
        ffplayer(bot, api, interaction, null, null);
    }
};
