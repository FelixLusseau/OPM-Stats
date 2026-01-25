const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const functions = require('../utils/functions.js');
const fs = require('fs');

async function ffattacks(bot, api, interaction, pingBool, channel, clan, guildID) {
    let text = null
    // Check if the command was run by an interaction or a scheduled message
    if (interaction != null) {
        await interaction.deferReply({ ephemeral: false });
        pingBool = interaction.options.getBoolean('ping');
        if (interaction.options.getString('clan')) {
            clan = interaction.options.getString('clan');
            if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
                return
        }
        text = interaction.options.getBoolean('text_version'); // For text version too
        guildID = interaction.guildId
    }

    let Players4 = "";
    let Players3 = "";
    let Players2 = "";
    let Players1 = "";
    let Players4HTML = "<span style='font-size: 1.5em; break-after: avoid; page-break-after: avoid;'><u><b>4 attacks</u> : </b></span>\n<ul>\n";
    let Players3HTML = "<span style='font-size: 1.5em; break-after: avoid; page-break-after: avoid;'><u><b>3 attacks</u> : </b></span>\n<ul>\n";
    let Players2HTML = "<span style='font-size: 1.5em; break-after: avoid; page-break-after: avoid;'><u><b>2 attacks</u> : </b></span>\n<ul>\n";
    let Players1HTML = "<span style='font-size: 1.5em; break-after: avoid; page-break-after: avoid;'><u><b>1 attack</u> : </b></span>\n<ul>\n";
    let ping = "";

    let RiverRace = null
    try {
        RiverRace = await api.getClanCurrentRiverRace(clan)
    } catch (error) {
        functions.errorEmbed(bot, interaction, channel, error)
        return
    }
    let points = 0
    if (RiverRace.periodType == "colosseum") { points = RiverRace.clan.fame.toString() } // Check if the war is the colosseum or not
    else { points = RiverRace.clan.periodPoints.toString() }
    let decksRemaining = 200
    for (let i = 0; i < RiverRace.clan.participants.length; i++) { // Calculate the number of decks remaining
        decksRemaining -= RiverRace.clan.participants[i].decksUsedToday
    }
    let ratio = 0
    ratio = await functions.ratio(RiverRace, decksRemaining, -1) // Calculate the ratio
    const estimate = Math.floor(ratio) * ((RiverRace.periodType == "colosseum") ? 800 : 200)// Invert of ratio calculation where the points are the unknown value

    if (pingBool && interaction == null && points == 0 && RiverRace.clan.fame >= 10000) // When war is finished when the scheduled message is sent
    {
        try {
            channel.send("The clan has finished the war !")
        } catch (error) {
            console.error("Ping error :" + error)
        }
        return
    }

    let remainingPlayers = 50
    let members = null
    try {
        members = await api.getClanMembers(clan)// Retrieve the clan's members from the Supercell API
    } catch (error) {
        functions.errorEmbed(bot, interaction, channel, error)
        return
    }

    for (let j = 0; j < RiverRace.clan.participants.length; j++) {
        let inclan = false
        const player = RiverRace.clan.participants[j]
        for (let i = 0; i < members.length; i++) {
            // If the player is in the clan and has used all his decks
            if (player.name == members[i].name && player.decksUsedToday == 4) {
                remainingPlayers--
                inclan = true
            }
            // If the player is in the clan and has not used all his decks
            if (player.name == members[i].name && player.decksUsedToday != 4) {
                let decksRemainingToday = 4 - player.decksUsedToday
                switch (decksRemainingToday) {
                    case 4:
                        Players4 += members[i].name + "\n";
                        Players4HTML += "<li style='margin-bottom: 20px;'>" + members[i].name + "</li>\n"
                        break;
                    case 3:
                        Players3 += members[i].name + "\n";
                        Players3HTML += "<li style='margin-bottom: 20px;'>" + members[i].name + "</li>\n"
                        remainingPlayers--
                        break;
                    case 2:
                        Players2 += members[i].name + "\n";
                        Players2HTML += "<li style='margin-bottom: 20px;'>" + members[i].name + "</li>\n"
                        remainingPlayers--
                        break;
                    case 1:
                        Players1 += members[i].name + "\n";
                        Players1HTML += "<li style='margin-bottom: 20px;'>" + members[i].name + "</li>\n"
                        remainingPlayers--
                        break;
                }
                inclan = true
                // If the ping option is enabled, find the cached Discord users with the same name as the players
                if (pingBool) {
                    guildMembers[guildID].forEach((member) => {
                        members[i].name = members[i].name.replace('\ufe0f', "").replace(/<[^>]+>/g, '')
                        // console.log(member)
                        if (member.user.username == members[i].name || member.nickname == members[i].name || member.user.globalName == members[i].name) {
                            ping += "<@" + member.user.id + "> "
                        }
                    }
                    )
                }
                break
            }
        }
        // If the player is not in the clan and has used all his decks
        if (!inclan && player.decksUsedToday == 4) {
            remainingPlayers--
        }
        // If the player is not in the clan and has used some of his decks
        if (!inclan && player.decksUsedToday != 0 && player.decksUsedToday != 4) {
            let decksRemainingToday = 4 - player.decksUsedToday
            switch (decksRemainingToday) {
                case 3:
                    Players3 += player.name + " **(out of the clan !!) " + "<a:Alert:1186367132263522455>" + "**\n";
                    Players3HTML += "<li style='margin-bottom: 20px;'>" + player.name + " <b>(out of the clan !!)</b></li>\n"
                    break;
                case 2:
                    Players2 += player.name + " **(out of the clan !!) " + "<a:Alert:1186367132263522455>" + "**\n";
                    Players2HTML += "<li style='margin-bottom: 20px;'>" + player.name + " <b>(out of the clan !!)</b></li>\n"
                    break;
                case 1:
                    Players1 += player.name + " **(out of the clan !!) " + "<a:Alert:1186367132263522455>" + "**\n";
                    Players1HTML += "<li style='margin-bottom: 20px;'>" + player.name + " <b>(out of the clan !!)</b></li>\n"
                    break;
            }
            remainingPlayers--
            // If the ping option is enabled, find the cached Discord users with the same name as the players
            if (pingBool) {
                guildMembers[guildID].forEach((member) => {
                    player.name = player.name.replace('\ufe0f', "").replace(/<[^>]+>/g, '')
                    if (member.user.username == player.name || member.nickname == player.name || member.user.globalName == player.name) {
                        ping += "<@" + member.user.id + "> "
                    }
                }
                )
            }
        }
    }

    Players4HTML += "</ul>\n"
    Players3HTML += "</ul>\n"
    Players2HTML += "</ul>\n"
    Players1HTML += "</ul>\n"

    if (interaction != null) {
        let remainingPlayersColor = "#30B32D"
        if (remainingPlayers > 10)
            remainingPlayersColor = "#F03E3E"
        else if (remainingPlayers > 5)
            remainingPlayersColor = "#FF8000"

        let decksRemainingColor = "#30B32D"
        if (decksRemaining > 40)
            decksRemainingColor = "#F03E3E"
        else if (decksRemaining > 20)
            decksRemainingColor = "#FF8000"

        let numbersHTML = ""
        let attacksHTML = ""
        const regex = /<li/g
        if (Players4HTML.search(regex) >= 0 || Players3HTML.search(regex) >= 0 || Players2HTML.search(regex) >= 0 || Players1HTML.search(regex) >= 0) // Check if the strings are not empty
        {
            numbersHTML = "<p>\n<b>🏅 Points</b> : "
                + points
                + "</p>\n"
                + "<p>\n<b>📟 Ratio</b> : "
                + ratio
                + "</p>\n"
                + "<canvas id='ratio' height=200 width=350 style='position: absolute; left: 15em; top: 6em;'></canvas>\n"
                + "<p>\n<b>📈 Estimate</b> : "
                + estimate
                + "</p>\n"
                + "<div style='display: flex; justify-content: space-between; align-items: center; padding-right: 3em;'>"
                + "<p>\n<b>🚸 Players</b> : "
                + remainingPlayers.toString()
                + "</p>\n"
                + "<div id='myProgress'>\n<div id='myBarPlayers'>\n" + remainingPlayers + "</div>\n</div>\n"
                + "</div>\n"
                + "<div style='display: flex; justify-content: space-between; align-items: center; padding-right: 3em;'>"
                + "<p style='display: inline-block;'>\n<b>⚔️ Attacks</b> : "
                + decksRemaining
                + "</p>\n"
                + "<div id='myProgress'>\n<div id='myBarAttacks'>\n" + decksRemaining + "</div>\n</div>\n"
                + "</div>\n"

            if (Players4HTML.search(regex) >= 0)
                attacksHTML += Players4HTML + "<br>"
            if (Players3HTML.search(regex) >= 0)
                attacksHTML += Players3HTML + "<br>"
            if (Players2HTML.search(regex) >= 0)
                attacksHTML += Players2HTML + "<br>"
            if (Players1HTML.search(regex) >= 0)
                attacksHTML += Players1HTML + "<br>"
        }

        const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
        fs.readFile('./html/layout.html', 'utf8', function (err, data) {
            if (err) {
                return console.log(err);
            }
            fs.readFile('./html/ffattacks.html', 'utf8', function (err, data2) {
                if (err) {
                    return console.log(err);
                }

                let result = data2.replace(/{{ Attacks }}/g, attacksHTML);
                result = result.replace(/{{ clan }}/g, (clansDict[clan] != undefined) ? clansDict[clan] : clan);
                result = result.replace(/{{ Numbers }}/g, numbersHTML);
                result = result.replace(/{{ ratio }}/g, ratio);
                result = result.replace(/900%/g, (100 - remainingPlayers * 2).toString() + "%");
                result = result.replace(/#000009/g, remainingPlayersColor);
                result = result.replace(/800%/g, (100 - decksRemaining / 2).toString() + "%");
                result = result.replace(/#000008/g, decksRemainingColor);

                let html = data.replace(/{{ body }}/g, result);
                html = html.replace(/{{ Background }}/g, 'Background_normal')

                fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                    if (err) return console.log(err);
                });
            });

        });

        await functions.renderCommand(interaction, tmpFile, 0)
    }

    let attacks = "" // String for the report
    const attacksEmbed = functions.generateEmbed(bot);
    if (Players4 != "" || Players3 != "" || Players2 != "" || Players1 != "") { // Check it the strings are not empty
        let ratioEmote = functions.ratioEmote(ratio)

        attacks = '<a:Colored_arrow:1186367114190270516> **Points** : '
            + points
            + "\n"
            + ratioEmote + ' **Ratio** : '
            + ratio
            + "\n"
            + "<a:Valider:1186367102936952952> **Estimate** : "
            + estimate
            + "\n"
            + '<a:Chevalier:1186367120083263594> **Players** : '
            + remainingPlayers.toString()
            + "\n"
            + '<:Mini_Pekka:1186367104962809947> **Attacks** : '
            + decksRemaining
            + '\n'

        Players1 = Players1.replace(/_/g, '\\_') // Escape the underscores to prevent undesired italic formatting
        Players2 = Players2.replace(/_/g, '\\_')
        Players3 = Players3.replace(/_/g, '\\_')
        Players4 = Players4.replace(/_/g, '\\_')

        attacksEmbed
            .setTitle("__Remaining attacks" + ((RiverRace.periodType == "colosseum") ? " (Colosseum)__ " : "__ ") + ":")
            .setDescription(attacks)
        if (Players4 != "") {
            attacksEmbed.addFields({ name: '__4 attacks__ :', value: Players4 })
            attacks += '\n__**4 attacks**__ :\n' + Players4
        }
        if (Players3 != "") {
            attacksEmbed.addFields({ name: '__3 attacks__ :', value: Players3 })
            attacks += '\n__**3 attacks**__ :\n' + Players3
        }
        if (Players2 != "") {
            attacksEmbed.addFields({ name: '__2 attacks__ :', value: Players2 })
            attacks += '\n__**2 attacks**__ :\n' + Players2
        }
        if (Players1 != "") {
            attacksEmbed.addFields({ name: '__1 attack__ :', value: Players1 })
            attacks += '\n__**1 attack**__ :\n' + Players1
        }

    }
    if (text != null || (pingBool && interaction == null)) { // If the text option is enabled
        // If the interaction is not null, edit the reply deferred before
        if (interaction != null) {
            interaction.editReply({ embeds: [attacksEmbed] });
        } else if (pingBool) {
            try {
                channel.send({ embeds: [attacksEmbed] });
            } catch (error) {
                console.error("Ping error :" + error)
            }
        }
    }

    if (interaction != null) {
        if (pingBool) {
            if (ping != "")
                interaction.channel.send(ping);
        }
    } else if (pingBool) {
        if (ping != "")
            try {
                channel.send(ping);
            } catch (error) {
                console.error("Ping error :" + error)
            }
    }
    return attacks // Return the string for the report
};

module.exports = {
    ffattacks,
    data: new SlashCommandBuilder()
        .setName('ffattacks')
        .setDescription('Replies the remaining attacks !')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Clan to check')
                .setAutocomplete(true)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('ping')
                .setDescription('Ping the players who don\'t have attacked left'))
        .addBooleanOption(option =>
            option.setName('text_version')
                .setDescription('Show the text version of the command too')),
    async execute(bot, api, interaction) {
        ffattacks(bot, api, interaction, false, null, null, null)
    },
};
