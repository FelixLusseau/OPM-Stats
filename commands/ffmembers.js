const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const functions = require('../utils/functions.js');

async function ffmembers(bot, api, interaction, clan) {
    await interaction.deferReply({ ephemeral: false });
    if (interaction.options.getString('clan')) {
        clan = interaction.options.getString('clan');
        if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
            return
    }
    let text = interaction.options.getBoolean('text_version'); // For text version too

    let response = null
    try {
        response = await api.getClanMembers(clan)
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error)
        return
    }

    let Members = "";
    let Members_text = "**" + response.length + " members**\n\n"
    // Make the string with the members' names, tags, roles, levels and trophies
    for (let i = 0; i < response.length; i++) {
        Members_text += "- **" + response[i].name + "** \n(" + response[i].tag + ", " + response[i].role + ", lvl " + response[i].expLevel + ", " + response[i].trophies + " tr)" + "\n\n"
        Members += "<tr>\n<td>" + response[i].name + "</td>\n<td>" + response[i].tag + "</td>\n<td>" + response[i].role + "</td>\n<td>" + response[i].expLevel + "</td>\n<td>" + response[i].trophies + " 🏆</td>\n</tr>\n"
    }
    Members_text = Members_text.replace(/_/g, '\\_') // Escape the underscores to prevent undesired italic formatting
    // console.log(Members_text)

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/ffmembers.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Players }}/g, Members);
            result = result.replace(/{{ nb }}/g, response.length);
            result = result.replace(/{{ clan }}/g, (clansDict[clan] != undefined) ? clansDict[clan] : clan);

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'bg/Background_normal')

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });

    });

    await functions.renderCommand(interaction, tmpFile, 0)

    if (text != null) {
        const membersEmbed = functions.generateEmbed(bot);
        try {
            membersEmbed
                .setTitle('__Current clan members__ :')
                .setDescription(Members_text)
        } catch (e) {
            console.log(e);
        }

        interaction.editReply({ embeds: [membersEmbed] });
    }
}

module.exports = {
    ffmembers,
    data: new SlashCommandBuilder()
        .setName('ffmembers')
        .setDescription('Replies the current members of the clan !')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('The clan to check')
                .setAutocomplete(true)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('text_version')
                .setDescription('Show the text version of the command too')),
    async execute(bot, api, interaction) {
        ffmembers(bot, api, interaction, null)
    },
};