const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const functions = require('../utils/functions.js');

async function fftournament(bot, api, interaction, clan) {
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

    let Tournament_text = "- Name: **" + response.name + "**\n"
    Tournament_text += "- Tag: **" + response.tag + "**\n"
    Tournament_text += "- Status: **" + response.status + "**\n"
    Tournament_text += "- Description: **" + response.description + "**\n"
    Tournament_text += "- Type: **" + response.type + "**\n"
    Tournament_text += "- Level cap: **" + response.levelCap + "**\n"
    Tournament_text += "- Tournament Players: **" + response.capacity + " / " + response.maxCapacity + "**\n"
    Tournament_text += "- Tournament start date: <t:" + startTimestamp + ":F> (<t:" + startTimestamp + ":R>)\n"
    if (response.endedTime) {
        Tournament_text += "- Tournament end date: <t:" + endTimestamp + ":F> (<t:" + endTimestamp + ":R>)\n"
    }
    Tournament_text += "- Preparation duration: **" + durationText + "**\n"
    Tournament_text += "Results:\n"

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
    let Tournament_HTML = "<ol style='font-size: 1.7em; text-align: left;'>\n"

    for (let i = 0; i < response.membersList.length; i++) {
        // console.log(response.membersList[i])
        const clanInfo = response.membersList[i].clan ? " (" + response.membersList[i].clan.name + ")" : "(No clan)";
        const pointText = response.membersList[i].score >= 2 ? "pts" : "pt";
        Tournament_text += (i + 1) + ". **" + response.membersList[i].name + "**" + clanInfo + " - **" + response.membersList[i].score + " " + pointText + "**\n"
        Tournament_HTML += "<li style='margin-bottom: 20px;'><b>" + response.membersList[i].name + "</b> - <b>" + response.membersList[i].score + "🏅" + "</b><br><small>" + clanInfo + "</small></li>\n"
    }

    // console.log(Tournament_text)
    // return

    Tournament_HTML += "</ol>\n"
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
                result = result.replace(/{{ Tournament }}/g, response.name);

                let html = data.replace(/{{ body }}/g, result);
                html = html.replace(/{{Background}}/g, 'Background_high')

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
                // .setDescription(Members_text)
                .setDescription(Tournament_text)
        } catch (e) {
            console.log(e);
        }

        interaction.editReply({ embeds: [membersEmbed] });
    }
}

module.exports = {
    fftournament,
    data: new SlashCommandBuilder()
        .setName('fftournament')
        .setDescription('Replies the current members of the clan !')
        .addStringOption(option =>
            option.setName('tag')
                .setDescription('Tag of the Player')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('text_version')
                .setDescription('Show the text version of the command too')),
    async execute(bot, api, interaction) {
        fftournament(bot, api, interaction, null)
    },
};