const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const functions = require('../utils/functions.js');
const fs = require('fs');

function isInClan(members, player) {
    for (let i = 0; i < members.length; i++) {
        if (members[i].tag == player.tag)
            return true
    }
    return false
}

async function ffresults(bot, api, interaction, clan) {
    let text = null
    let include_zero_players = null
    let members = null
    // Check if the command was run by an interaction or a scheduled message
    if (interaction != null) {
        await interaction.deferReply({ ephemeral: false });
        clan = interaction.options.getString('clan');
        if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
            return
        text = interaction.options.getBoolean('text_version'); // For text version too
        include_zero_players = interaction.options.getBoolean('include_zero_players');
        if (include_zero_players) {
            try {
                members = await api.getClanMembers(clan)// Retrieve the clan's members from the Supercell API
            } catch (error) {
                functions.errorEmbed(bot, interaction, channel, error)
                return
            }
        }
    }

    let Players = "";
    let PlayersHTML = "<ul style='font-size: 2.5em; text-align: left;'>\n";
    let RiverRace = null
    try {
        RiverRace = await api.getClanCurrentRiverRace(clan)// Get info about the River Race
    } catch (error) {
        functions.errorEmbed(bot, interaction, channel, error)
        return
    }

    // Sort the players by fame
    RiverRace.clan.participants.sort((a, b) => (a.fame < b.fame) ? 1 : -1)
    for (let j = 0; j < RiverRace.clan.participants.length; j++) {
        if ((RiverRace.clan.participants[j].decksUsed > 0 && RiverRace.clan.participants[j].fame > 0) || (include_zero_players && isInClan(members, RiverRace.clan.participants[j]))) {
            // Make a list of the players who have attacked and their fame
            Players += "- " + RiverRace.clan.participants[j].name + " : **" + RiverRace.clan.participants[j].fame + " pts**\n"
            PlayersHTML += "<li style='margin-bottom: 20px;'>" + RiverRace.clan.participants[j].name + " : <b>" + RiverRace.clan.participants[j].fame + " 🏅</b></li>\n"
        }
    }
    PlayersHTML += "</ul>\n"
    Players = Players.replace(/_/g, '\\_') // Escape the underscores to prevent undesired italic formatting

    if (interaction != null) {
        const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
        fs.readFile('./html/layout.html', 'utf8', function (err, data) {
            if (err) {
                return console.log(err);
            }
            fs.readFile('./html/ffresults.html', 'utf8', function (err, data2) {
                if (err) {
                    return console.log(err);
                }

                let result = data2.replace(/{{ Results }}/g, PlayersHTML);
                result = result.replace(/{{ clan }}/g, (clansDict[clan] != undefined) ? clansDict[clan] : clan);

                let html = data.replace(/{{ body }}/g, result);
                html = html.replace(/{{ Background }}/g, 'bg/Background_small')

                fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                    if (err) return console.log(err);
                });
            });

        });

        const regex = /<li/g
        if (PlayersHTML.search(regex) >= 0) {
            await functions.renderCommand(interaction, tmpFile, 0)
        }
        else {
            interaction.editReply({ content: "No players have attacked yet !" })
        }
    }


    if (text != null) {
        const resultsEmbed = functions.generateEmbed(bot);
        try {
            if (interaction) {
                resultsEmbed
                    .setTitle('__Players\' war results__ :')
                    .setDescription((Players.length > 0) ? Players : "No players have attacked yet !")
            }
        } catch (e) {
            console.log(e);
        }

        if (interaction != null) { interaction.editReply({ embeds: [resultsEmbed] }); }
    }
    return Players // Return the list of players and their fame for the report
}

module.exports = {
    ffresults,
    data: new SlashCommandBuilder()
        .setName('ffresults')
        .setDescription('Replies the current war points of the players !')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('The clan to check')
                .setAutocomplete(true)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('include_zero_players')
                .setDescription('Include the players with 0 pts'))
        .addBooleanOption(option =>
            option.setName('text_version')
                .setDescription('Show the text version of the command too')),
    async execute(bot, api, interaction) {
        ffresults(bot, api, interaction, null)
    },
};