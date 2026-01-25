const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const functions = require('../utils/functions.js');

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

async function results(bot, api, interaction, type) {
    await interaction.deferReply({ ephemeral: false });
    if (interaction.options.getString('tag')) {
        tag = interaction.options.getString('tag');
    }
    let text = interaction.options.getBoolean('text_version'); // For text version too

    let response = null
    try {
        response = await api.getTournamentByTag(tag)
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error)
        return
    }
    // console.log(JSON.stringify(response, null, 4))

    const { Infos_text, Infos_HTML } = tournamentInfos(response);

    let Tournament_text = ""
    let Tournament_HTML = ""

    // Call the appropriate results function based on the type
    const results = type === "clans" ? clanResults(response) : playerResults(response);
    Tournament_text += results.Tournament_text;
    Tournament_HTML += results.Tournament_HTML;

    // console.log(Tournament_text)
    // return

    Tournament_text = Tournament_text.replace(/_/g, '\\_') // Escape the underscores to prevent undesired italic formatting

    if (interaction != null) {
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
                switch (type) {
                    case "players":
                        html = html.replace(/{{ Background }}/g, 'Background_high')
                        html = html.replace(/{{ Type }}/g, 'Players')
                        break;
                    case "clans":
                        html = html.replace(/{{ Background }}/g, 'Background_small')
                        html = html.replace(/{{ Type }}/g, 'Clans')
                        break;
                }

                fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                    if (err) return console.log(err);
                });
            });

        });

        const regex = /<li/g
        if (Tournament_HTML.search(regex) >= 0) {
            await functions.renderCommand(interaction, tmpFile, 0)
        }
        else {
            interaction.editReply({ content: "No players have played yet !" })
        }
    }

    if (text != null) {
        const membersEmbed = functions.generateEmbed(bot);
        try {
            membersEmbed
                .setTitle('__Tournament ' + tag + '__ :')
                .setDescription(Infos_text + Tournament_text)
        } catch (e) {
            console.log(e);
        }

        interaction.editReply({ embeds: [membersEmbed] });
    }
}

async function winner(bot, api, interaction, clan) {
    await interaction.deferReply({ ephemeral: false });
    if (interaction.options.getString('tag')) {
        tag = interaction.options.getString('tag');
    }
    let text = interaction.options.getBoolean('text_version'); // For text version too

    let response = null
    try {
        response = await api.getTournamentByTag(tag)
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error)
        return
    }

    const clanInfo = response.membersList[0].clan ? "from " + response.membersList[0].clan.name : "";
    let Tournament_HTML = "<div style='font-size: 4em; font-weight: bold; color: #764ba2; margin: 20px 0; text-shadow: 3px 3px 6px rgba(0,0,0,0.2);'>"
        + response.membersList[0].name
        + "</div><br><div style='font-size: 2.5em;'>"
        + clanInfo
        + "<br>with "
        + response.membersList[0].score
        + "🏅</div>";

    if (interaction != null) {
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

                let html = data.replace(/{{ body }}/g, result);
                html = html.replace(/{{ Background }}/g, 'Background_small')

                fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                    if (err) return console.log(err);
                });
            });

        });

        await functions.renderCommand(interaction, tmpFile, 0)
    }
}

module.exports = {
    results,
    winner,
    data: new SlashCommandBuilder()
        .setName('fftournament')
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
            subcommand.setName('clan_ranking')
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
                await results(bot, api, interaction, "players");
                break;
            case 'winner':
                await winner(bot, api, interaction);
                break;
            case 'pass_winner':
                // await passWinner(bot, api, interaction);
                break;
            case 'podium':
                // await podium(bot, api, interaction);
                break;
            case 'clans_ranking':
                await results(bot, api, interaction, "clans");
                break;
        }
    },
};