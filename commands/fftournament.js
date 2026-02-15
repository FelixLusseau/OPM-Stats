const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const functions = require('../utils/functions.js');

// Store temporary tournament data in RAM
const tournamentSessions = new Map();

function createPlayerSelectionMenu(membersList, page = 0, sessionId, buttonLabel = '✅ Generate ranking') {
    const ITEMS_PER_PAGE = 25;
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, membersList.length);
    const totalPages = Math.ceil(membersList.length / ITEMS_PER_PAGE);

    const options = [];
    for (let i = startIndex; i < endIndex; i++) {
        const player = membersList[i];
        const clanInfo = player.clan ? player.clan.name : "No clan";
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(`${i + 1}. ${player.name.substring(0, 50)}`)
                .setDescription(`${clanInfo.substring(0, 50)} - ${player.score} pts`)
                .setValue(player.tag)
        );
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`tournament_exclude_${sessionId}_${page}`)
        .setPlaceholder(`Select players to exclude (page ${page + 1}/${totalPages})`)
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const buttons = [];

    if (page > 0) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`tournament_prev_${sessionId}_${page}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Primary)
        );
    }

    if (endIndex < membersList.length) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`tournament_next_${sessionId}_${page}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Primary)
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setCustomId(`tournament_generate_${sessionId}`)
            .setLabel(buttonLabel)
            .setStyle(ButtonStyle.Success)
    );

    const buttonRow = new ActionRowBuilder().addComponents(buttons);

    return { components: [row, buttonRow], totalPages };
}

function createCollector(interaction, sessionId) {
    const session = tournamentSessions.get(sessionId);
    if (!session) return;

    const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId.includes(sessionId),
        time: 300000 // 5 minutes
    });

    collector.on('collect', async i => {
        try {
            const [action, sid, pageStr] = i.customId.split('_').slice(1);
            const currentPage = parseInt(pageStr) || 0;

            if (action === 'prev' || action === 'next') {
                // Handle pagination
                const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;
                const { components } = createPlayerSelectionMenu(session.response.membersList, newPage, sessionId);

                await i.update({ components });
            } else if (action === 'exclude') {
                // Store excluded players (accumulate selections across pages)
                session.excludedPlayers = i.values;
                await i.deferUpdate();
            } else if (action === 'generate') {
                // Clear the selection message (remove embed and components)
                let generatingMessage = '⏳ Generating ranking...';
                if (session.commandType === 'winner') {
                    generatingMessage = '⏳ Generating winner...';
                } else if (session.commandType === 'podium') {
                    generatingMessage = '⏳ Generating podium...';
                }

                await i.update({ embeds: [], components: [], content: generatingMessage });
                collector.stop('generated');

                // Filter excluded players
                const filteredResponse = {
                    ...session.response,
                    membersList: session.response.membersList.filter(
                        player => !session.excludedPlayers.includes(player.tag)
                    )
                };

                // Call appropriate generation function
                await generateFinalResult(session.bot, session.api, interaction, filteredResponse, session);
            }
        } catch (error) {
            console.error('Error handling interaction:', error);
            await i.reply({ content: 'An error occurred while processing your selection.', ephemeral: true });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            // Clear message on timeout
            try {
                await interaction.editReply({ embeds: [], components: [], content: '⏱️ Selection timeout (5 minutes). Please run the command again.' });
            } catch (err) {
                console.error('Error clearing message on timeout:', err);
            }
        }
        // Clean up session
        tournamentSessions.delete(sessionId);
    });
}

async function generateFinalResult(bot, api, interaction, response, session) {
    if (response.membersList.length === 0) {
        await interaction.followUp({ content: "No players remaining after exclusions!" });
        return;
    }

    switch (session.commandType) {
        case 'players_ranking':
            await generatePlayersRanking(bot, interaction, response, session.textVersion);
            break;
        case 'clans_ranking':
            await generateClansRanking(bot, interaction, response, session.textVersion);
            break;
        case 'winner':
            await generateWinner(bot, interaction, response);
            break;
        case 'pass_winner':
            await generatePassWinner(bot, interaction, response);
            break;
        case 'podium':
            await generatePodium(bot, interaction, response);
            break;
    }
}

async function generatePlayersRanking(bot, interaction, response, textVersion) {
    const { Infos_text, Infos_HTML } = tournamentInfos(response);
    const { Tournament_text, Tournament_HTML } = playerResults(response);

    const Tournament_text_escaped = Tournament_text.replace(/_/g, '\\_');

    const tmpFile = 'tmpfiles/' + (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/fftournament.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Results }}/g, Tournament_HTML);
            result = result.replace(/{{ Infos }}/g, Infos_HTML);
            result = result.replace(/{{ Tournament_Name }}/g, response.name);

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Columns }}/g, 3);
            html = html.replace(/{{ Background }}/g, 'bg_tournament/Background_high');
            html = html.replace(/{{ Type }}/g, 'Players');

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });
    });

    const regex = /<li/g;
    if (Tournament_HTML.search(regex) >= 0) {
        await functions.renderCommand(interaction, tmpFile, 0);
        // Clear the loading message
        await interaction.editReply({ content: '' });
    } else {
        await interaction.followUp({ content: "No players have played yet!" });
    }

    if (textVersion) {
        const membersEmbed = functions.generateEmbed(bot);
        try {
            membersEmbed
                .setTitle('__Tournament ' + response.tag + '__ :')
                .setDescription(Infos_text + Tournament_text_escaped);
        } catch (e) {
            console.log(e);
        }
        await interaction.followUp({ embeds: [membersEmbed] });
    }
}

async function generateClansRanking(bot, interaction, response, textVersion) {
    const { Infos_text, Infos_HTML } = tournamentInfos(response);
    const { Tournament_text, Tournament_HTML } = clanResults(response);

    const Tournament_text_escaped = Tournament_text.replace(/_/g, '\\_');

    const tmpFile = 'tmpfiles/' + (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/fftournament.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Results }}/g, Tournament_HTML);
            result = result.replace(/{{ Infos }}/g, Infos_HTML);
            result = result.replace(/{{ Tournament_Name }}/g, response.name);

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Columns }}/g, 2);
            html = html.replace(/{{ Background }}/g, 'bg_tournament/Background_high');
            html = html.replace(/{{ Type }}/g, 'Clans');

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });
    });

    const regex = /<li/g;
    if (Tournament_HTML.search(regex) >= 0) {
        await functions.renderCommand(interaction, tmpFile, 0);
        // Clear the loading message
        await interaction.editReply({ content: '' });
    } else {
        await interaction.followUp({ content: "No players have played yet!" });
    }

    if (textVersion) {
        const membersEmbed = functions.generateEmbed(bot);
        try {
            membersEmbed
                .setTitle('__Tournament ' + response.tag + '__ :')
                .setDescription(Infos_text + Tournament_text_escaped);
        } catch (e) {
            console.log(e);
        }
        await interaction.followUp({ embeds: [membersEmbed] });
    }
}

async function generateWinner(bot, interaction, response) {
    const clanInfo = response.membersList[0].clan ? "from " + response.membersList[0].clan.name : "";
    let Tournament_HTML = "<div style='font-size: 8em; font-weight: bold; color: #764ba2; margin: 20px 0; text-shadow: 3px 3px 6px rgba(0,0,0,0.2);'>"
        + response.membersList[0].name
        + "</div><br><div style='font-size: 4.5em;'>"
        + clanInfo
        + "<br>with "
        + response.membersList[0].score
        + "🏅</div>";

    const tmpFile = 'tmpfiles/' + (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/fftournament-winner.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Winner }}/g, Tournament_HTML);
            result = result.replace(/{{ Tournament }}/g, response.name);
            // Format date from "20250215T120000" to readable format
            const startDateStr = response.startedTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
            const formattedDate = new Date(startDateStr).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
            result = result.replace(/{{ Date }}/g, formattedDate);
            result = result.replace(/{{ H2 }}/g, "🏆 CHAMPION 🏆");
            result = result.replace(/{{ Winner_Type }}/g, "Winner");
            result = result.replace(/{{ MarginBottom }}/g, "8em");
            result = result.replace(/{{ MarginTop }}/g, "15.5em");

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'bg_tournament/Background_small');

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });
    });

    await functions.renderCommand(interaction, tmpFile, 0);
    // Clear the loading message
    await interaction.editReply({ content: '' });
}

async function generatePassWinner(bot, interaction, response) {
    // The winner is already determined (first player in membersList)
    const selectedPlayer = response.membersList[0];

    const clanInfo = selectedPlayer.clan ? "from " + selectedPlayer.clan.name : "(No clan)";
    let Tournament_HTML = "<div style='font-size: 8em; font-weight: bold; color: #764ba2; margin: 20px 0; text-shadow: 3px 3px 6px rgba(0,0,0,0.2);'>"
        + selectedPlayer.name
        + "</div><br><div style='font-size: 4.5em;'>"
        + clanInfo
        + "</div>";

    const tmpFile = 'tmpfiles/' + (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/fftournament-winner.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Winner }}/g, Tournament_HTML);
            result = result.replace(/{{ Tournament }}/g, response.name);
            // Format date from "20250215T120000" to readable format
            const startDateStr = response.startedTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
            const formattedDate = new Date(startDateStr).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
            result = result.replace(/{{ Date }}/g, formattedDate);
            result = result.replace(/{{ H2 }}/g, "🎁 PASS WINNER 🎁");
            result = result.replace(/{{ Winner_Type }}/g, "Pass Winner");
            result = result.replace(/{{ MarginBottom }}/g, "8em");
            result = result.replace(/{{ MarginTop }}/g, "18em");
            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'bg_tournament/Background_small');

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });
    });

    await functions.renderCommand(interaction, tmpFile, 0);
    // Clear the loading message
    await interaction.editReply({ content: '' });
}

async function generatePodium(bot, interaction, response) {
    const top3 = response.membersList.slice(0, 3);

    let Podium_HTML = "<div style='display: flex; align-items: flex-end; justify-content: center; gap: 30px; margin: 40px 0;'>";

    // 2nd place (left)
    if (top3.length >= 2) {
        const clanInfo = top3[1].clan ? top3[1].clan.name : "No clan";
        Podium_HTML += "<div style='text-align: center;'>";
        Podium_HTML += "<div style='font-size: 4em; margin-bottom: 15px;'>🥈</div>";
        Podium_HTML += "<div style='background: linear-gradient(135deg, #C0C0C0 0%, #E8E8E8 100%); padding: 40px 30px; border-radius: 20px 20px 0 0; min-width: 280px; height: 240px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 -5px 20px rgba(192,192,192,0.4);'>";
        Podium_HTML += "<div style='font-size: 2.5em; font-weight: bold; color: #333; margin-bottom: 15px;'>" + top3[1].name + "</div>";
        Podium_HTML += "<div style='font-size: 1.8em; color: #666; margin-bottom: 10px;'>" + top3[1].score + "🏅</div>";
        Podium_HTML += "<div style='font-size: 1.3em; color: #999;'><i>" + clanInfo + "</i></div>";
        Podium_HTML += "</div></div>";
    }

    // 1st place (center, taller)
    if (top3.length >= 1) {
        const clanInfo = top3[0].clan ? top3[0].clan.name : "No clan";
        Podium_HTML += "<div style='text-align: center;'>";
        Podium_HTML += "<div style='font-size: 5em; margin-bottom: 15px;'>🥇</div>";
        Podium_HTML += "<div style='background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); padding: 50px 35px; border-radius: 20px 20px 0 0; min-width: 320px; height: 340px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 -5px 25px rgba(255,215,0,0.5);'>";
        Podium_HTML += "<div style='font-size: 3em; font-weight: bold; color: #333; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(255,255,255,0.3);'>" + top3[0].name + "</div>";
        Podium_HTML += "<div style='font-size: 2.2em; color: #333; margin-bottom: 15px; font-weight: bold;'>" + top3[0].score + "🏅</div>";
        Podium_HTML += "<div style='font-size: 1.5em; color: #555;'><i>" + clanInfo + "</i></div>";
        Podium_HTML += "</div></div>";
    }

    // 3rd place (right)
    if (top3.length >= 3) {
        const clanInfo = top3[2].clan ? top3[2].clan.name : "No clan";
        Podium_HTML += "<div style='text-align: center;'>";
        Podium_HTML += "<div style='font-size: 4em; margin-bottom: 15px;'>🥉</div>";
        Podium_HTML += "<div style='background: linear-gradient(135deg, #CD7F32 0%, #E9967A 100%); padding: 35px 30px; border-radius: 20px 20px 0 0; min-width: 280px; height: 200px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 -5px 20px rgba(205,127,50,0.4);'>";
        Podium_HTML += "<div style='font-size: 2.5em; font-weight: bold; color: #333; margin-bottom: 15px;'>" + top3[2].name + "</div>";
        Podium_HTML += "<div style='font-size: 1.8em; color: #666; margin-bottom: 10px;'>" + top3[2].score + "🏅</div>";
        Podium_HTML += "<div style='font-size: 1.3em; color: #999;'><i>" + clanInfo + "</i></div>";
        Podium_HTML += "</div></div>";
    }

    Podium_HTML += "</div>";

    const tmpFile = 'tmpfiles/' + (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/fftournament-winner.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Winner }}/g, Podium_HTML);
            result = result.replace(/{{ Tournament }}/g, response.name);
            // Format date from "20250215T120000" to readable format
            const startDateStr = response.startedTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
            const formattedDate = new Date(startDateStr).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
            result = result.replace(/{{ Date }}/g, formattedDate);
            result = result.replace(/{{ H2 }}/g, "🏆 PODIUM 🏆");
            result = result.replace(/{{ Winner_Type }}/g, "Podium");
            result = result.replace(/{{ MarginBottom }}/g, "5em");
            result = result.replace(/{{ MarginTop }}/g, "15.5em");

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'bg_tournament/Background_small');

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });
    });

    await functions.renderCommand(interaction, tmpFile, 0);
    // Clear the loading message
    await interaction.editReply({ content: '' });
}

function tournamentInfos(response) {
    // Parse to ISO format
    const startDateStr = response.startedTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
    const startTimestamp = Math.floor(new Date(startDateStr).getTime() / 1000);
    const endDateStr = response.endedTime?.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6');
    const endTimestamp = Math.floor(new Date(endDateStr).getTime() / 1000);

    // Convert seconds to hours/minutes
    const prepDuration = response.preparationDuration;
    let durationText;
    if (prepDuration >= 3600) {
        const hours = Math.floor(prepDuration / 3600);
        const minutes = Math.floor((prepDuration % 3600) / 60);
        durationText = hours + (hours >= 2 ? " hours" : " hour");
        if (minutes > 0) {
            durationText += " " + minutes + (minutes >= 2 ? " minutes" : " minute");
        }
    } else {
        const minutes = Math.floor(prepDuration / 60);
        durationText = minutes + (minutes >= 2 ? " minutes" : " minute");
    }

    let Infos_text = "- Name: **" + response.name + "**\n"
    Infos_text += "- Tag: **" + response.tag + "**\n"
    Infos_text += "- Status: **" + response.status + "**\n"
    Infos_text += "- Description: **" + response.description + "**\n"
    Infos_text += "- Type: **" + response.type + "**\n"
    Infos_text += "- Level cap: **" + response.levelCap + "**\n"
    Infos_text += "- Tournament Players: **" + response.capacity + " / " + response.maxCapacity + "**\n"
    Infos_text += "- Tournament start date: <t:" + startTimestamp + ":F> (<t:" + startTimestamp + ":R>)\n"
    if (response.endedTime) {
        Infos_text += "- Tournament end date: <t:" + endTimestamp + ":F> (<t:" + endTimestamp + ":R>)\n"
    }
    Infos_text += "- Preparation duration: **" + durationText + "**\n"
        + "Results:\n"

    let Infos_HTML = "<p style='margin-bottom: 0.15em;'>\n<b>Description</b> : "
        + response.description
        + "</p>\n"
        + "<div style='display: grid; grid-template-columns: 1fr 1fr; gap: 0em;'>\n"
        + "<p>\n<b>Tag</b> : "
        + response.tag
        + "</p>\n"
        + "<p>\n<b>Type</b> : "
        + response.type
        + "</p>\n"
        + "<p>\n<b>Status</b> : "
        + response.status
        + "</p>\n"
        + "<p>\n<b>Level cap</b> : "
        + response.levelCap
        + "</p>\n"
        + "<p>\n<b>Tournament players</b> : "
        + response.capacity + " / " + response.maxCapacity
        + "</p>\n"
        + "<p>\n<b>Preparation duration</b> : "
        + durationText
        + "</p>\n"
        + "<p>\n<b>Start date</b> : "
        + new Date(startTimestamp * 1000).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
        + "</p>\n";
    if (response.endedTime) {
        Infos_HTML += "<p>\n<b>End date</b> : "
            + new Date(endTimestamp * 1000).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
            + "</p>\n";
    }
    Infos_HTML += "</div>\n"
        + "<h3 style='margin-block-start: 0.7em; margin-block-end: 0.15em;'>Results:</h3>\n"
    return { Infos_text, Infos_HTML };
}

function playerResults(response) {
    let Tournament_text = "";
    let Tournament_HTML = "<ol style='font-size: 1.4em; text-align: left;'>\n";
    for (let i = 0; i < response.membersList.length; i++) {
        const clanInfo = response.membersList[i].clan ? " (" + response.membersList[i].clan.name + ")" : "(No clan)";
        const pointText = response.membersList[i].score >= 2 ? "pts" : "pt";
        Tournament_text += (i + 1) + ". **" + response.membersList[i].name + "**" + clanInfo + " - **" + response.membersList[i].score + " " + pointText + "**\n"
        Tournament_HTML += "<li style='margin-bottom: 20px;'><b>" + response.membersList[i].name + "</b> - <b>" + response.membersList[i].score + "🏅" + "</b><br><small>" + clanInfo + "</small></li>\n"
    }
    Tournament_HTML += "</ol>\n"
    return { Tournament_text, Tournament_HTML };
}

function clanResults(response) {
    let Tournament_text = "";
    let Tournament_HTML = "<ol style='font-size: 2em; text-align: left; padding-left: 2em;'>\n";

    // Group players by clan and sum their scores
    const clanScores = {};
    let noClanScore = 0;
    let noClanCount = 0;

    for (let i = 0; i < response.membersList.length; i++) {
        const player = response.membersList[i];
        if (player.clan) {
            const clanTag = player.clan.tag;
            if (!clanScores[clanTag]) {
                clanScores[clanTag] = {
                    name: player.clan.name,
                    tag: clanTag,
                    totalScore: 0,
                    playerCount: 0
                };
            }
            clanScores[clanTag].totalScore += player.score;
            clanScores[clanTag].playerCount += 1;
        } else {
            noClanScore += player.score;
            noClanCount += 1;
        }
    }

    // Convert to array and sort by total score descending
    const clansArray = Object.values(clanScores).sort((a, b) => b.totalScore - a.totalScore);

    for (let i = 0; i < clansArray.length; i++) {
        const clan = clansArray[i];
        const pointText = clan.totalScore >= 2 ? "pts" : "pt";
        Tournament_text += (i + 1) + ". **" + clan.name + "** (" + clan.playerCount + " players) - **" + clan.totalScore + " " + pointText + "**\n"
        Tournament_HTML += "<li style='margin-bottom: 20px;'><b>" + clan.name + "</b> - <b>" + clan.totalScore + "🏅" + "</b><br><small>" + clan.playerCount + " player" + (clan.playerCount > 1 ? "s" : "") + "</small></li>\n"
    }

    // Add unranked players without clan
    if (noClanCount > 0) {
        const pointText = noClanScore >= 2 ? "pts" : "pt";
        Tournament_text += "\n**Out of ranking** : " + noClanCount + " player" + (noClanCount > 1 ? "s" : "") + " without clan - **" + noClanScore + " " + pointText + "**\n";
        Tournament_HTML += "<li style='margin-bottom: 20px; list-style-type: none;'><b><i>Not in their clan</i></b> - <b>" + noClanScore + "🏅" + "</b><br><small>" + noClanCount + " player" + (noClanCount > 1 ? "s" : "") + " <br>(Out of clans ranking)</small></li>\n";
    }
    Tournament_HTML += "</ol>\n";

    return { Tournament_text, Tournament_HTML };
}

async function results(bot, api, interaction) {
    await interaction.deferReply({ ephemeral: false });

    const tag = interaction.options.getString('tag');
    const textVersion = interaction.options.getBoolean('text_version');
    const commandType = interaction.options.getSubcommand();

    let response = null;
    try {
        response = await api.getTournamentByTag(tag);
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error);
        return;
    }

    // Check if there are players in the tournament
    if (!response.membersList || response.membersList.length === 0) {
        await interaction.editReply({ content: "No players have participated in this tournament yet!" });
        return;
    }

    // Create session
    const sessionId = (Math.random() + 1).toString(36).substring(2, 15);
    tournamentSessions.set(sessionId, {
        bot,
        api,
        response,
        commandType,
        textVersion,
        excludedPlayers: [],
        tag
    });

    // Create player selection embed
    const { Infos_text } = tournamentInfos(response);
    const selectionEmbed = functions.generateEmbed(bot)
        .setTitle(`🎯 Tournament: ${response.name}`)
        .setDescription(`**Step 1/2:** Select players to exclude from the ranking\n\n**Total players:** ${response.membersList.length}\n\n*Use the menu below to select players to exclude, then click "Generate ranking"*`);

    const { components } = createPlayerSelectionMenu(response.membersList, 0, sessionId);

    await interaction.editReply({
        embeds: [selectionEmbed],
        components
    });

    createCollector(interaction, sessionId);
}

async function winner(bot, api, interaction, clan) {
    await interaction.deferReply({ ephemeral: false });

    const tag = interaction.options.getString('tag');

    let response = null;
    try {
        response = await api.getTournamentByTag(tag);
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error);
        return;
    }

    // Check if there are players in the tournament
    if (!response.membersList || response.membersList.length === 0) {
        await interaction.editReply({ content: "No players have participated in this tournament yet!" });
        return;
    }

    // Create session
    const sessionId = (Math.random() + 1).toString(36).substring(2, 15);
    tournamentSessions.set(sessionId, {
        bot,
        api,
        response,
        commandType: 'winner',
        excludedPlayers: [],
        tag
    });

    // Create player selection embed
    const currentWinner = response.membersList[0];
    const winnerClan = currentWinner.clan ? currentWinner.clan.name : "No clan";

    const selectionEmbed = functions.generateEmbed(bot)
        .setTitle(`🏆 Tournament: ${response.name}`)
        .setDescription(`**Step 1/2:** Select players to exclude from winner selection\n\n**Current winner:** ${currentWinner.name} (${winnerClan}) - ${currentWinner.score}🏅\n\n**Total players:** ${response.membersList.length}\n\n*Use the menu below to select players to exclude, then click "Generate winner"*`);

    const { components } = createPlayerSelectionMenu(response.membersList, 0, sessionId, '✅ Generate winner');

    await interaction.editReply({
        embeds: [selectionEmbed],
        components
    });

    createCollector(interaction, sessionId);
}

async function passWinner(bot, api, interaction, clan) {
    await interaction.deferReply({ ephemeral: false });

    const tag = interaction.options.getString('tag');

    let response = null;
    try {
        response = await api.getTournamentByTag(tag);
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error);
        return;
    }

    // Check if there are players in the tournament
    if (!response.membersList || response.membersList.length === 0) {
        await interaction.editReply({ content: "No players have participated in this tournament yet!" });
        return;
    }

    // Random draw: select a random player from the list
    const randomIndex = Math.floor(Math.random() * response.membersList.length);
    const selectedPlayer = response.membersList[randomIndex];

    // Create session with the drawn player
    const sessionId = (Math.random() + 1).toString(36).substring(2, 15);
    tournamentSessions.set(sessionId, {
        bot,
        api,
        response,
        commandType: 'pass_winner',
        excludedPlayers: [selectedPlayer.tag],
        selectedWinner: selectedPlayer,
        tag
    });

    // Create selection embed showing the drawn winner
    const clanInfo = selectedPlayer.clan ? selectedPlayer.clan.name : "No clan";
    const selectionEmbed = functions.generateEmbed(bot)
        .setTitle(`🎁 Pass Winner: ${response.name}`)
        .setDescription(`**Winner drawn:**\n\n🎉 **${selectedPlayer.name}**\n${clanInfo} - ${selectedPlayer.score}🏅\n\n*Click "Confirm" to generate the image or "Redraw" to pick another winner*`);

    // Create action buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tournament_redraw_${sessionId}`)
            .setLabel('🎲 Redraw')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`tournament_confirmwinner_${sessionId}`)
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({
        embeds: [selectionEmbed],
        components: [row]
    });

    createPassWinnerCollector(interaction, sessionId);
}

function createPassWinnerCollector(interaction, sessionId) {
    const session = tournamentSessions.get(sessionId);
    if (!session) return;

    const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId.includes(sessionId),
        time: 300000 // 5 minutes
    });

    collector.on('collect', async i => {
        try {
            const action = i.customId.split('_')[1];

            if (action === 'redraw') {
                // Exclude current winner and draw a new one
                const availablePlayers = session.response.membersList.filter(
                    player => !session.excludedPlayers.includes(player.tag)
                );

                if (availablePlayers.length === 0) {
                    await i.update({
                        embeds: [functions.generateEmbed(session.bot)
                            .setTitle(`🎁 Pass Winner: ${session.response.name}`)
                            .setDescription('All players have been excluded. No more players to draw!')],
                        components: []
                    });
                    collector.stop('no_more_players');
                    return;
                }

                const randomIndex = Math.floor(Math.random() * availablePlayers.length);
                const newSelectedPlayer = availablePlayers[randomIndex];

                // Update session
                session.excludedPlayers.push(newSelectedPlayer.tag);
                session.selectedWinner = newSelectedPlayer;

                // Update embed with new winner
                const clanInfo = newSelectedPlayer.clan ? newSelectedPlayer.clan.name : "No clan";
                const updatedEmbed = functions.generateEmbed(session.bot)
                    .setTitle(`🎁 Pass Winner: ${session.response.name}`)
                    .setDescription(`**Winner drawn:**\n\n🎉 **${newSelectedPlayer.name}**\n${clanInfo} - ${newSelectedPlayer.score}🏅\n\n*Click "Confirm" to generate the image or "Redraw" to pick another winner*`);

                await i.update({ embeds: [updatedEmbed] });

            } else if (action === 'confirmwinner') {
                // Confirm and generate
                await i.update({ embeds: [], components: [], content: '⏳ Generating winner...' });
                collector.stop('confirmed');

                // Create filtered response with only the selected winner
                const filteredResponse = {
                    ...session.response,
                    membersList: [session.selectedWinner]
                };

                // Generate the final image
                await generatePassWinner(session.bot, interaction, filteredResponse);
            }
        } catch (error) {
            console.error('Error handling pass winner interaction:', error);
            await i.reply({ content: 'An error occurred while processing your selection.', ephemeral: true });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            try {
                await interaction.editReply({ embeds: [], components: [], content: '⏱️ Selection timeout (5 minutes). Please run the command again.' });
            } catch (err) {
                console.error('Error clearing message on timeout:', err);
            }
        }
        tournamentSessions.delete(sessionId);
    });
}

async function podium(bot, api, interaction) {
    await interaction.deferReply({ ephemeral: false });

    const tag = interaction.options.getString('tag');

    let response = null;
    try {
        response = await api.getTournamentByTag(tag);
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error);
        return;
    }

    // Check if there are players in the tournament
    if (!response.membersList || response.membersList.length === 0) {
        await interaction.editReply({ content: "No players have participated in this tournament yet!" });
        return;
    }

    // Create session
    const sessionId = (Math.random() + 1).toString(36).substring(2, 15);
    tournamentSessions.set(sessionId, {
        bot,
        api,
        response,
        commandType: 'podium',
        excludedPlayers: [],
        tag
    });

    // Create player selection embed
    const top3 = response.membersList.slice(0, 3);
    let podiumPreview = "";
    if (top3.length >= 1) podiumPreview += `🥇 ${top3[0].name} - ${top3[0].score}🏅\n`;
    if (top3.length >= 2) podiumPreview += `🥈 ${top3[1].name} - ${top3[1].score}🏅\n`;
    if (top3.length >= 3) podiumPreview += `🥉 ${top3[2].name} - ${top3[2].score}🏅\n`;

    const selectionEmbed = functions.generateEmbed(bot)
        .setTitle(`🏆 Tournament: ${response.name}`)
        .setDescription(`**Step 1/2:** Select players to exclude from podium\n\n**Current podium:**\n${podiumPreview}\n**Total players:** ${response.membersList.length}\n\n*Use the menu below to select players to exclude, then click "Generate podium"*`);

    const { components } = createPlayerSelectionMenu(response.membersList, 0, sessionId, '✅ Generate podium');

    await interaction.editReply({
        embeds: [selectionEmbed],
        components
    });

    createCollector(interaction, sessionId);
}

// ==================== BRACKET FUNCTIONS ====================

async function bracket(bot, api, interaction) {
    await interaction.deferReply({ ephemeral: false });

    const tag = interaction.options.getString('tag');
    const clanTag = interaction.options.getString('clan');

    let response = null;
    try {
        response = await api.getTournamentByTag(tag);
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error);
        return;
    }

    // Check if there are at least 8 players
    if (!response.membersList || response.membersList.length < 8) {
        await interaction.editReply({ content: `Not enough players for a bracket! Need at least 8 players, found ${response.membersList?.length || 0}.` });
        return;
    }

    // Create session
    const sessionId = (Math.random() + 1).toString(36).substring(2, 15);
    tournamentSessions.set(sessionId, {
        bot,
        api,
        response,
        commandType: 'bracket',
        excludedPlayers: [],
        tag,
        clanTag,
        bracketMatches: null
    });

    // Create player selection embed
    const selectionEmbed = functions.generateEmbed(bot)
        .setTitle(`🏆 Tournament Bracket: ${response.name}`)
        .setDescription(`**Step 1/2:** Select players to exclude from bracket\n\n**Total players:** ${response.membersList.length}\n**Top 8:** ${response.membersList.slice(0, 8).map((p, i) => `${i + 1}. ${p.name}`).join(', ')}\n\n*Use the menu below to select players to exclude, then click "Generate bracket"*`);

    const { components } = createPlayerSelectionMenu(response.membersList, 0, sessionId, '✅ Generate bracket');

    await interaction.editReply({
        embeds: [selectionEmbed],
        components
    });

    createBracketCollector(interaction, sessionId);
}

function createBracketCollector(interaction, sessionId) {
    const session = tournamentSessions.get(sessionId);
    if (!session) return;

    const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId.includes(sessionId),
        time: 840000 // 14 minutes (marge de sécurité avant l'expiration de l'interaction à 15 min)
    });

    collector.on('collect', async i => {
        try {
            const [action, sid, pageStr] = i.customId.split('_').slice(1);
            const currentPage = parseInt(pageStr) || 0;

            if (action === 'prev' || action === 'next') {
                // Handle pagination
                const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;
                const { components } = createPlayerSelectionMenu(session.response.membersList, newPage, sessionId, '✅ Generate bracket');
                await i.update({ components });
            } else if (action === 'exclude') {
                // Store excluded players
                session.excludedPlayers = i.values;
                await i.deferUpdate();
            } else if (action === 'generate') {
                // Generate bracket
                await i.update({ embeds: [], components: [], content: '⏳ Generating bracket...' });

                // Filter excluded players
                const filteredResponse = {
                    ...session.response,
                    membersList: session.response.membersList.filter(
                        player => !session.excludedPlayers.includes(player.tag)
                    )
                };

                // Check if we still have at least 8 players
                if (filteredResponse.membersList.length < 8) {
                    await i.editReply({ content: `Not enough players after exclusions! Need at least 8, have ${filteredResponse.membersList.length}.`, components: [] });
                    collector.stop('insufficient_players');
                    return;
                }

                // Initialize bracket with top 8 players
                // const top8 = filteredResponse.membersList.slice(0, 8);
                // console.log('Top 8 players for bracket:', top8);
                const top8 = [
                    {
                        tag: '#RC89QUVRV',
                        name: 'Nayo',
                        score: 7,
                        rank: 1,
                        clan: { tag: '#CRV0C8', name: 'Les vieux sages', badgeId: 16000001 }
                    },
                    {
                        tag: '#89GQGLRQ',
                        name: 'Sleazy✝️就係我嘅',
                        score: 6,
                        rank: 3,
                        clan: { tag: '#YPUJGCPP', name: 'Rebellion’', badgeId: 16000162 }
                    },
                    {
                        tag: '#2JRRQ82QL',
                        name: 'Legendary',
                        score: 5,
                        rank: 4,
                        clan: { tag: '#2UQ2VCCC', name: 'WarxUnion 2', badgeId: 16000002 }
                    },
                    {
                        tag: '#YLVJV8220',
                        name: 'Djé 160921',
                        score: 5,
                        rank: 5,
                        clan: { tag: '#PQPQGGCR', name: "Biem's", badgeId: 16000078 }
                    },
                    {
                        tag: '#GQQR9PQ2',
                        name: 'lucase',
                        score: 5,
                        rank: 6,
                        clan: { tag: '#LLLJJ9PC', name: 'Valet de Trêfle', badgeId: 16000171 }
                    },
                    {
                        tag: '#QVU9P9PJ9',
                        name: 'ʳᶦᵖTECHNOBLADE⚔',
                        score: 5,
                        rank: 7,
                        clan: { tag: '#QUPY8GP9', name: 'TF Brownie', badgeId: 16000171 }
                    },
                    {
                        tag: '#VUVCVCRV9',
                        name: 'Omerkf78',
                        score: 5,
                        rank: 8,
                        clan: { tag: '#GJV2JJQP', name: 'Camille580', badgeId: 16000078 }
                    },
                    {
                        tag: '#G0PJRYVV',
                        name: 'Mange-Noeud❗️',
                        score: 5,
                        rank: 9,
                        clan: { tag: '#2UQ2VCCC', name: 'WarxUnion 2', badgeId: 16000002 }
                    }
                ]
                session.bracketMatches = initializeBracket(top8, session.clanTag);

                // Generate and display bracket
                await generateBracketDisplay(session.bot, interaction, session);

                // Clear the loading message and add update button
                const updateRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_updatebracket_${sessionId}`)
                        .setLabel('🔄 Update Results')
                        .setStyle(ButtonStyle.Primary)
                );

                await i.editReply({
                    content: '✅ Bracket generated! Click "Update Results" to fetch latest match results from battle logs.',
                    components: [updateRow]
                });
            } else if (action === 'updatebracket') {
                await i.update({ content: '⏳ Updating bracket from battle logs...', components: [] });

                // Update bracket with battle log data
                await updateBracketFromBattleLogs(session);

                // Regenerate display
                await generateBracketDisplay(session.bot, interaction, session);

                // Keep the update button
                const updateRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_updatebracket_${sessionId}`)
                        .setLabel('🔄 Update Results')
                        .setStyle(ButtonStyle.Primary)
                );

                // Update the message with button
                await i.editReply({
                    content: '✅ Bracket updated with latest results! (New image sent below)',
                    components: [updateRow]
                });
            }
        } catch (error) {
            console.error('Error handling bracket interaction:', error);
            await i.reply({ content: 'An error occurred: ' + error.message, ephemeral: true });
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            try {
                await interaction.editReply({ components: [], content: '⏱️ Bracket session expired.' });
            } catch (err) {
                console.error('Error on timeout:', err);
            }
        }
        tournamentSessions.delete(sessionId);
    });
}

function initializeBracket(top8, clanTag) {
    // Standard bracket seeding: 1v8, 4v5, 3v6, 2v7
    const matches = {
        quarterFinals: [
            { id: 'A', player1: top8[0], player2: top8[7], winner: null, loser: null },
            { id: 'B', player1: top8[3], player2: top8[4], winner: null, loser: null },
            { id: 'C', player1: top8[2], player2: top8[5], winner: null, loser: null },
            { id: 'D', player1: top8[1], player2: top8[6], winner: null, loser: null }
        ],
        semiFinals: [
            { id: 'Semi1', player1: null, player2: null, winner: null, loser: null }, // Winner A vs Winner B
            { id: 'Semi2', player1: null, player2: null, winner: null, loser: null }  // Winner C vs Winner D
        ],
        final: { id: 'Final', player1: null, player2: null, winner: null, loser: null },
        clanTag: clanTag
    };

    return matches;
}

async function updateBracketFromBattleLogs(session) {
    console.log('🚀 Starting updateBracketFromBattleLogs...');
    const matches = session.bracketMatches;
    const clanTag = matches.clanTag;
    console.log('🏷️ Clan filter:', clanTag || '(none)');

    // Get all player tags in the bracket
    const allPlayers = new Set();
    matches.quarterFinals.forEach(m => {
        if (m.player1) allPlayers.add(m.player1.tag);
        if (m.player2) allPlayers.add(m.player2.tag);
    });

    // console.log('🔍 DEBUG: allPlayers size:', allPlayers.size);
    // console.log('🔍 DEBUG: allPlayers:', Array.from(allPlayers));

    // Fetch battle logs for all players
    const battleLogs = new Map();
    for (const playerTag of allPlayers) {
        // console.log('🔍 DEBUG: Fetching battle log for player:', playerTag);
        try {
            const log = await session.api.getPlayerBattleLog(playerTag);
            // console.log('✅ DEBUG: Battle log received for', playerTag);
            // console.log(JSON.stringify(log, null, 2));
            battleLogs.set(playerTag, log);
        } catch (error) {
            console.error(`❌ Error fetching battle log for ${playerTag}:`, error);
        }
    }

    // Update quarter finals
    for (const match of matches.quarterFinals) {
        await updateMatchFromBattleLogs(match, battleLogs, clanTag);
    }

    // Update semi-finals based on quarter-final winners
    matches.semiFinals[0].player1 = matches.quarterFinals[0].winner;
    matches.semiFinals[0].player2 = matches.quarterFinals[1].winner;
    matches.semiFinals[1].player1 = matches.quarterFinals[2].winner;
    matches.semiFinals[1].player2 = matches.quarterFinals[3].winner;

    for (const match of matches.semiFinals) {
        if (match.player1 && match.player2) {
            await updateMatchFromBattleLogs(match, battleLogs, clanTag);
        }
    }

    // Update final
    matches.final.player1 = matches.semiFinals[0].winner;
    matches.final.player2 = matches.semiFinals[1].winner;

    if (matches.final.player1 && matches.final.player2) {
        await updateMatchFromBattleLogs(matches.final, battleLogs, clanTag);
    }
}

async function updateMatchFromBattleLogs(match, battleLogs, clanTag) {
    if (!match.player1 || !match.player2) {
        console.log('⚠️ Match skipped: missing players');
        return;
    }

    const p1Tag = match.player1.tag;
    const p2Tag = match.player2.tag;
    const p1Log = battleLogs.get(p1Tag);
    const p2Log = battleLogs.get(p2Tag);

    // console.log(`🔍 DEBUG: Checking match: ${match.player1.name} vs ${match.player2.name}`);
    // console.log(`   Player 1 log entries: ${p1Log?.length || 0}`);
    // console.log(`   Player 2 log entries: ${p2Log?.length || 0}`);

    if (!p1Log || !p2Log) {
        console.log('⚠️ Missing battle logs for one or both players');
        return;
    }

    // Look for friendly battles between these two players in the same clan
    let clanMateCount = 0;
    for (const battle of p1Log) {
        if (battle.type === 'clanMate') {
            clanMateCount++;
            const opponent = battle.opponent?.[0];
            // console.log(`   🤝 ClanMate battle found - opponent: ${opponent?.name || 'unknown'} (${opponent?.tag || 'no tag'})`);

            if (opponent && opponent.tag === p2Tag) {
                // console.log(`   ✅ MATCH FOUND between ${match.player1.name} and ${match.player2.name}!`);

                // Check if battle is in the correct clan (if clan filter specified)
                if (clanTag) {
                    const battleClan = battle.team?.[0]?.clan?.tag;
                    // console.log(`   Checking clan filter: expected=${clanTag}, actual=${battleClan}`);
                    if (battleClan !== clanTag) {
                        // console.log(`   ❌ Clan mismatch, skipping this battle`);
                        continue;
                    }
                }

                // Determine winner
                if (battle.team && battle.opponent) {
                    const p1Crowns = battle.team[0]?.crowns || 0;
                    const p2Crowns = battle.opponent[0]?.crowns || 0;

                    // console.log(`   Score: ${match.player1.name} ${p1Crowns} - ${p2Crowns} ${match.player2.name}`);

                    if (p1Crowns > p2Crowns) {
                        match.winner = match.player1;
                        match.loser = match.player2;
                        match.score = `${p1Crowns}-${p2Crowns}`;
                        // console.log(`   🏆 Winner: ${match.player1.name}`);
                    } else if (p2Crowns > p1Crowns) {
                        match.winner = match.player2;
                        match.loser = match.player1;
                        match.score = `${p2Crowns}-${p1Crowns}`;
                        // console.log(`   🏆 Winner: ${match.player2.name}`);
                    }
                    return; // Found the match, stop searching
                }
            }
        }
    }
    // console.log(`   ℹ️ DEBUG: Total clanMate battles found for ${match.player1.name}: ${clanMateCount}`);
    // console.log(`   ❌ DEBUG: No matching battle found between these players`);
}

async function generateBracketDisplay(bot, interaction, session) {
    const matches = session.bracketMatches;
    const response = session.response;

    // Generate HTML for each match
    const matchA_HTML = generateMatchHTML(matches.quarterFinals[0]);
    const matchB_HTML = generateMatchHTML(matches.quarterFinals[1]);
    const matchC_HTML = generateMatchHTML(matches.quarterFinals[2]);
    const matchD_HTML = generateMatchHTML(matches.quarterFinals[3]);

    const semi1_HTML = generateMatchHTML(matches.semiFinals[0]);
    const semi2_HTML = generateMatchHTML(matches.semiFinals[1]);

    const final_HTML = generateMatchHTML(matches.final);

    // Generate champion display
    let champion_HTML = '';
    if (matches.final.winner) {
        const clanInfo = matches.final.winner.clan ? matches.final.winner.clan.name : "No clan";
        champion_HTML = `<div class="champion">
            <div class="champion-title">🏆 CHAMPION 🏆</div>
            <div class="champion-name">${matches.final.winner.name}</div>
            <div style="font-size: 1.2em; margin-top: 10px;">${clanInfo}</div>
            <div style="font-size: 1.5em; margin-top: 10px;">${matches.final.winner.score}🏅</div>
        </div>`;
    }

    // Generate update info
    const updateTime = new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'medium' });
    const update_info = `<div class="update-info">
        Last updated: ${updateTime}<br>
        Results are automatically fetched from friendly battles in ${matches.clanTag ? 'clan ' + matches.clanTag : 'any clan'}
    </div>`;

    // Create HTML file
    const tmpFile = 'tmpfiles/' + (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/fftournament-bracket.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Tournament_Name }}/g, response.name);
            result = result.replace(/{{ Champion }}/g, champion_HTML);
            result = result.replace(/{{ Match_A }}/g, matchA_HTML);
            result = result.replace(/{{ Match_B }}/g, matchB_HTML);
            result = result.replace(/{{ Match_C }}/g, matchC_HTML);
            result = result.replace(/{{ Match_D }}/g, matchD_HTML);
            result = result.replace(/{{ Semi_1 }}/g, semi1_HTML);
            result = result.replace(/{{ Semi_2 }}/g, semi2_HTML);
            result = result.replace(/{{ Final }}/g, final_HTML);
            result = result.replace(/{{ Update_Info }}/g, update_info);

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'bg_tournament/Background_small');

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });
    });

    // Render the bracket
    await functions.renderCommand(interaction, tmpFile, 500);
}

function generateMatchHTML(match) {
    if (!match.player1 || !match.player2) {
        return '<div class="player">TBD</div><div class="player">TBD</div>';
    }

    const p1Class = match.winner?.tag === match.player1.tag ? 'winner' : (match.loser?.tag === match.player1.tag ? 'loser' : '');
    const p2Class = match.winner?.tag === match.player2.tag ? 'winner' : (match.loser?.tag === match.player2.tag ? 'loser' : '');

    const p1Score = match.winner?.tag === match.player1.tag ? (match.score ? match.score.split('-')[0] : '') : (match.score ? match.score.split('-')[1] : '');
    const p2Score = match.winner?.tag === match.player2.tag ? (match.score ? match.score.split('-')[0] : '') : (match.score ? match.score.split('-')[1] : '');

    let html = `<div class="player ${p1Class}">
        <span class="player-name">${match.player1.name}</span>
        ${p1Score ? `<span class="player-score">${p1Score}</span>` : ''}
    </div>
    <div class="player ${p2Class}">
        <span class="player-name">${match.player2.name}</span>
        ${p2Score ? `<span class="player-score">${p2Score}</span>` : ''}
    </div>`;

    return html;
}

function createTournamentCommand(commandName) {
    return {
        results,
        winner,
        passWinner,
        podium,
        bracket,
        data: new SlashCommandBuilder()
            .setName(commandName)
            .setDescription('Tournaments commands !')
            .addSubcommand(subcommand =>
                subcommand.setName('players_ranking')
                    .setDescription('Get the players ranking of a tournament by its tag')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag of the Tournament')
                            .setRequired(true))
                    .addBooleanOption(option =>
                        option.setName('text_version')
                            .setDescription('Show the text version of the command too')))
            .addSubcommand(subcommand =>
                subcommand.setName('winner')
                    .setDescription('Get the winner of a tournament by its tag')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag of the Tournament')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand.setName('pass_winner')
                    .setDescription('Randomly choose the pass winner of a tournament by its tag')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag of the Tournament')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand.setName('podium')
                    .setDescription('Get the podium of a tournament by its tag')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag of the Tournament')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand.setName('bracket')
                    .setDescription('Generate a tournament bracket (elimination) for top 8 players')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag of the Tournament')
                            .setRequired(true))
                    .addStringOption(option =>
                        option.setName('clan')
                            .setDescription('Clan tag to filter friendly battles (optional)')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand.setName('clans_ranking')
                    .setDescription('Get the clan ranking of a tournament by its tag')
                    .addStringOption(option =>
                        option.setName('tag')
                            .setDescription('Tag of the Tournament')
                            .setRequired(true))
                    .addBooleanOption(option =>
                        option.setName('text_version')
                            .setDescription('Show the text version of the command too'))),
        async execute(bot, api, interaction) {
            switch (interaction.options.getSubcommand()) {
                case 'players_ranking':
                    await results(bot, api, interaction);
                    break;
                case 'winner':
                    await winner(bot, api, interaction);
                    break;
                case 'pass_winner':
                    await passWinner(bot, api, interaction);
                    break;
                case 'podium':
                    await podium(bot, api, interaction);
                    break;
                case 'bracket':
                    await bracket(bot, api, interaction);
                    break;
                case 'clans_ranking':
                    await results(bot, api, interaction);
                    break;
            }
        },
    };
}

module.exports = createTournamentCommand('fftournament');
module.exports.createTournamentCommand = createTournamentCommand;