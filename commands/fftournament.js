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

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
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
            html = html.replace(/{{ Background }}/g, 'Background_high');
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

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
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
            html = html.replace(/{{ Background }}/g, 'Background_normal');
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
    let Tournament_HTML = "<div style='font-size: 4em; font-weight: bold; color: #764ba2; margin: 20px 0; text-shadow: 3px 3px 6px rgba(0,0,0,0.2);'>"
        + response.membersList[0].name
        + "</div><br><div style='font-size: 2.5em;'>"
        + clanInfo
        + "<br>with "
        + response.membersList[0].score
        + "🏅</div>";

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
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
            result = result.replace(/{{ H2 }}/g, "🏆 CHAMPION 🏆");
            result = result.replace(/{{ Winner_Type }}/g, "Winner");

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'Background_small');

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
    let Tournament_HTML = "<div style='font-size: 4em; font-weight: bold; color: #667eea; margin: 20px 0; text-shadow: 3px 3px 6px rgba(0,0,0,0.2);'>"
        + selectedPlayer.name
        + "</div><br><div style='font-size: 2.5em;'>"
        + clanInfo
        + "</div>";

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
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
            result = result.replace(/{{ H2 }}/g, "🎁 PASS WINNER 🎁");
            result = result.replace(/{{ Winner_Type }}/g, "Pass Winner");

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'Background_small');

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

    let Podium_HTML = "<div style='display: flex; align-items: flex-end; justify-content: center; gap: 20px; margin: 40px 0;'>";

    // 2nd place (left)
    if (top3.length >= 2) {
        const clanInfo = top3[1].clan ? top3[1].clan.name : "No clan";
        Podium_HTML += "<div style='text-align: center;'>";
        Podium_HTML += "<div style='font-size: 3em; margin-bottom: 10px;'>🥈</div>";
        Podium_HTML += "<div style='background: linear-gradient(135deg, #C0C0C0 0%, #E8E8E8 100%); padding: 30px 20px; border-radius: 15px 15px 0 0; min-width: 200px; height: 180px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 -5px 20px rgba(192,192,192,0.4);'>";
        Podium_HTML += "<div style='font-size: 2em; font-weight: bold; color: #333; margin-bottom: 10px;'>" + top3[1].name + "</div>";
        Podium_HTML += "<div style='font-size: 1.3em; color: #666; margin-bottom: 8px;'>" + top3[1].score + "🏅</div>";
        Podium_HTML += "<div style='font-size: 1em; color: #999;'><i>" + clanInfo + "</i></div>";
        Podium_HTML += "</div></div>";
    }

    // 1st place (center, taller)
    if (top3.length >= 1) {
        const clanInfo = top3[0].clan ? top3[0].clan.name : "No clan";
        Podium_HTML += "<div style='text-align: center;'>";
        Podium_HTML += "<div style='font-size: 4em; margin-bottom: 10px;'>🥇</div>";
        Podium_HTML += "<div style='background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); padding: 40px 25px; border-radius: 15px 15px 0 0; min-width: 220px; height: 250px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 -5px 25px rgba(255,215,0,0.5);'>";
        Podium_HTML += "<div style='font-size: 2.5em; font-weight: bold; color: #333; margin-bottom: 15px; text-shadow: 2px 2px 4px rgba(255,255,255,0.3);'>" + top3[0].name + "</div>";
        Podium_HTML += "<div style='font-size: 1.6em; color: #333; margin-bottom: 10px; font-weight: bold;'>" + top3[0].score + "🏅</div>";
        Podium_HTML += "<div style='font-size: 1.1em; color: #555;'><i>" + clanInfo + "</i></div>";
        Podium_HTML += "</div></div>";
    }

    // 3rd place (right)
    if (top3.length >= 3) {
        const clanInfo = top3[2].clan ? top3[2].clan.name : "No clan";
        Podium_HTML += "<div style='text-align: center;'>";
        Podium_HTML += "<div style='font-size: 3em; margin-bottom: 10px;'>🥉</div>";
        Podium_HTML += "<div style='background: linear-gradient(135deg, #CD7F32 0%, #E9967A 100%); padding: 25px 20px; border-radius: 15px 15px 0 0; min-width: 200px; height: 150px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 -5px 20px rgba(205,127,50,0.4);'>";
        Podium_HTML += "<div style='font-size: 2em; font-weight: bold; color: #333; margin-bottom: 10px;'>" + top3[2].name + "</div>";
        Podium_HTML += "<div style='font-size: 1.3em; color: #666; margin-bottom: 8px;'>" + top3[2].score + "🏅</div>";
        Podium_HTML += "<div style='font-size: 1em; color: #999;'><i>" + clanInfo + "</i></div>";
        Podium_HTML += "</div></div>";
    }

    Podium_HTML += "</div>";

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
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
            result = result.replace(/{{ H2 }}/g, "🏆 PODIUM 🏆");
            result = result.replace(/{{ Winner_Type }}/g, "Podium");

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'Background_small');

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
        + new Date(startTimestamp * 1000).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })
        + "</p>\n";
    if (response.endedTime) {
        Infos_HTML += "<p>\n<b>End date</b> : "
            + new Date(endTimestamp * 1000).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })
            + "</p>\n";
    }
    Infos_HTML += "</div>\n"
        + "<h3 style='margin-block-start: 0.7em; margin-block-end: 0.15em;'>Results:</h3>\n"
    return { Infos_text, Infos_HTML };
}

function playerResults(response) {
    let Tournament_text = "";
    let Tournament_HTML = "<ol style='font-size: 1.7em; text-align: left;'>\n";
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
    let Tournament_HTML = "<ol style='font-size: 1.7em; text-align: left;'>\n";

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

function createTournamentCommand(commandName) {
    return {
        results,
        winner,
        passWinner,
        podium,
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
                case 'clans_ranking':
                    await results(bot, api, interaction);
                    break;
            }
        },
    };
}

module.exports = createTournamentCommand('fftournament');
module.exports.createTournamentCommand = createTournamentCommand;