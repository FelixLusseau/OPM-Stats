const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const functions = require('../utils/functions.js');
const fs = require('fs');

async function ffopponents(bot, api, interaction, clan) {
    await interaction.deferReply({ ephemeral: false });
    if (interaction.options.getString('clan')) {
        clan = interaction.options.getString('clan');
        if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
            return
    }
    let text = interaction.options.getBoolean('text_version'); // For text version too
    let Opponents = "";
    let scores = [];
    let charts = "";

    let RiverRace = null
    try {
        RiverRace = await api.getClanCurrentRiverRace(clan)
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error)
        return
    }

    let opponentsText = "<ul style='font-size: 2.4em; text-align: left;'>\n";
    let Labels = []
    let seasons = []

    for (let i = 0; i < RiverRace.clans.length; i++) {
        let clan = null
        try {
            clan = await api.getClanByTag(RiverRace.clans[i].tag)// Get the clans' info from the Supercell API
        } catch (error) {
            functions.errorEmbed(bot, interaction, interaction.channel, error)
            return
        }
        Labels.push(RiverRace.clans[i].name)
        // console.log("clan : " + RiverRace.clans[i].name)

        // Get the badges' data from the RoyaleAPI
        const badgesData = require('../utils/badges.json');
        for (let i = 0; i < badgesData.length; i++) {
            if (badgesData[i].id == clan.badgeId) {
                opponentsText += "<li style='margin-bottom: 10px;'><img src='https://royaleapi.github.io/cr-api-assets/badges/" + badgesData[i].name + ".png' height='45'>&nbsp;\n"
                break
            }
        }
        // Make the string from the clans' names, tags, locations, trophies and numbers of members
        Opponents += "- __**" + RiverRace.clans[i].name + "**__ " + " :\n" + RiverRace.clans[i].tag + ", " + clan.location.name + ", " + clan.clanWarTrophies + " tr, " + clan.members + " members\n\n"
        opponentsText += "<b><span style='font-size: 1.7em;'>" + RiverRace.clans[i].name + " : </span></b>" + RiverRace.clans[i].tag + ", " + clan.location.name + ", " + clan.clanWarTrophies + " tr, " + clan.members + " members\n\n<br>"
        let history = await functions.fetchHist(RiverRace.clans[i].tag.substring(1)); // Get the clans' history from RoyaleAPI
        let clanScores = []
        let ranksScores = []
        let ranksScoresText = []
        for (let h = 0; h < history.items.length; h++) {
            // Add the colosseum history on the last seasons
            for (let s = 0; s < history.items[h].standings.length; s++) {
                if (history.items[h].standings[s].clan.tag == RiverRace.clans[i].tag && history.items[h].standings[s].clan.fame > 11000) {
                    let tmp, tmpText = ""
                    tmp = "Season " + history.items[h].seasonId + " : **" + history.items[h].standings[s].rank
                    tmpText = /* "Season " + history.items[h].seasonId + " :  */"<b>" + history.items[h].standings[s].rank
                    switch (history.items[h].standings[s].rank) {
                        case 1:
                            tmp += "st 🥇** with **"
                            tmpText += "st 🥇</b> with <b>"
                            break;
                        case 2:
                            tmp += "nd 🥈** with **"
                            tmpText += "nd 🥈</b> with <b>"
                            break;
                        case 3:
                            tmp += "rd 🥉** with **"
                            tmpText += "rd 🥉</b> with <b>"
                            break;
                        default:
                            tmp += "th** with **"
                            tmpText += "th</b> with <b>"
                            break;
                    }
                    tmp += history.items[h].standings[s].clan.fame + "**\n"
                    tmpText += history.items[h].standings[s].clan.fame + "</b>\n" //"</b><br>\n"
                    clanScores.push(history.items[h].standings[s].clan.fame)
                    seasons.push(history.items[h].seasonId)
                    ranksScores.unshift(tmp) // Add the data to the beginning of the array
                    ranksScoresText.unshift(tmpText)
                }
            }
        }
        Opponents += ranksScores.join("")
        opponentsText += ranksScoresText.join(" / ")
        scores.push(clanScores)
        Opponents += "\n\n"
        opponentsText += "</li>\n<br>"
    }
    opponentsText += "</ul>\n"
    max = 180000 // Max value for the charts at Colosseum
    // console.log(Labels)
    // console.log(scores)
    let Datas = []
    for (let i = 0; i < scores[0].length; i++) {
        let tmpDatas = []
        for (let j = 0; j < scores.length; j++) {
            tmpDatas.push(scores[j][i])
        }
        Datas.push(tmpDatas)
    }
    const chart = functions.barChart('bar', Labels, Datas.reverse(), seasons.reverse(), max);
    const encodedChart = encodeURIComponent(JSON.stringify(chart));
    const chartUrl = `https://quickchart.io/chart?c=${encodedChart}&width=680`;
    charts += "<tr style='background-color: white; border: 1px solid black'>\n<td><img style='height: 700px' src=\"" + chartUrl + "\"></td>\n</tr>\n"
    // Add a blank character to the end of the string to avoid a bug with the embed (force an empty line)
    Opponents += "\u200b"

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/ffopponents.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Charts }}/g, charts);
            result = result.replace(/{{ clan }}/g, (clansDict[clan] != undefined) ? clansDict[clan] : clan);
            result = result.replace(/{{ Opponents }}/g, opponentsText);

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'bg/Background_small')

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });

    });

    await functions.renderCommand(interaction, tmpFile, 0)

    if (text != null) {
        const opponentsEmbed = functions.generateEmbed(bot);
        try {
            opponentsEmbed
                .setTitle('__Current opponents__ :')
                .setDescription(Opponents)
                .setImage(chartUrl)
        } catch (e) {
            console.log(e);
        }

        interaction.editReply({ embeds: [opponentsEmbed] });
    }
}

module.exports = {
    ffopponents,
    data: new SlashCommandBuilder()
        .setName('ffopponents')
        .setDescription('Replies info about the current opponents !')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Clan to check')
                .setAutocomplete(true)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('text_version')
                .setDescription('Show the text version of the command too')),
    async execute(bot, api, interaction) {
        ffopponents(bot, api, interaction, null)
    },
};