const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const functions = require('../utils/functions.js');
const fs = require('fs');

async function ffriver(bot, api, interaction, clan) {
    await interaction.deferReply({ ephemeral: false });
    if (interaction.options.getString('clan')) {
        clan = interaction.options.getString('clan');
        if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
            return
    }
    let text = interaction.options.getBoolean('text_version'); // For text version too
    let Labels = [];
    let Datas = [];
    let Race = "";

    let RiverRace = null
    try {
        RiverRace = await api.getClanCurrentRiverRace(clan)// Get info about the River Race
    } catch (error) {
        functions.errorEmbed(bot, interaction, interaction.channel, error)
        return
    }

    // Chart data processing
    for (let i = 0; i < RiverRace.clans.length; i++) {
        let labels = RiverRace.clans[i].name
        Labels.push(labels);
        let data = RiverRace.clans[i].fame
        Datas.push(data);
    }

    RiverRace.clans.sort((a, b) => (a.fame < b.fame) ? 1 : -1) // Sort clans by fame
    for (let i = 0; i < RiverRace.clans.length; i++) {
        // If the clan has already reached 10k fame in normal days, show it as finished
        if (RiverRace.periodType != "colosseum" && RiverRace.clans[i].fame >= 10000) {
            if (interaction != null)
                Race += "- __"
                    + (RiverRace.clans[i].tag == clan ? "**" + RiverRace.clans[i].name + "**" : RiverRace.clans[i].name)
                    + "__ : **War finished**\n<:Hashtag:1186369411439923220> Tag : "
                    + RiverRace.clans[i].tag + "\n\n"
            else
                Race += "- __"
                    + (RiverRace.clans[i].tag == clan ? "**" + RiverRace.clans[i].name + "**" : RiverRace.clans[i].name)
                    + "__ : **War finished**\n Tag : "
                    + RiverRace.clans[i].tag + "\n\n"
            continue
        }
        // Else show the current name, tag and fame
        if (interaction != null)
            Race += "- __"
                + (RiverRace.clans[i].tag == clan ? "**" + RiverRace.clans[i].name + "**" : RiverRace.clans[i].name)
                + "__ :\n<:Hashtag:1186369411439923220> Tag : "
                + RiverRace.clans[i].tag
                + "\n<a:Colored_arrow:1186367114190270516> Pts : **"
                + RiverRace.clans[i].fame
                + "**\n\n"
        else
            Race += "- __"
                + (RiverRace.clans[i].tag == clan ? "**" + RiverRace.clans[i].name + "**" : RiverRace.clans[i].name)
                + "__ :\n Tag : "
                + RiverRace.clans[i].tag
                + "\n Pts : **"
                + RiverRace.clans[i].fame
                + "**\n\n"
    }

    // Race = Race.replace(/_/g, '\\_') // Escape the underscores to prevent undesired italic formatting

    // Define the max value of the chart depending on the periode type
    let max = 0
    if (RiverRace.periodType == "colosseum") max = 180000
    else max = 10000

    // Chart creation
    Datas = [Datas]
    const chart = functions.barChart('bar', Labels, Datas, null, max);
    const encodedChart = encodeURIComponent(JSON.stringify(chart));
    const chartUrl = `https://quickchart.io/chart?c=${encodedChart}&width=820`; // *2
    // console.log(chartUrl);

    const tmpFile = (Math.random() + 1).toString(36).substring(7) + '.html';
    fs.readFile('./html/layout.html', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        fs.readFile('./html/ffriver.html', 'utf8', function (err, data2) {
            if (err) {
                return console.log(err);
            }

            let result = data2.replace(/{{ Chart }}/g, chartUrl);
            result = result.replace(/{{ clan }}/g, (clansDict[clan] != undefined) ? clansDict[clan] : clan);

            let html = data.replace(/{{ body }}/g, result);
            html = html.replace(/{{ Background }}/g, 'bg/Background_small')

            fs.writeFile('./' + tmpFile, html, 'utf8', function (err) {
                if (err) return console.log(err);
            });
        });

    });

    await functions.renderCommand(interaction, tmpFile, 0)

    if (text != null) {
        const riverEmbed = functions.generateEmbed(bot);
        try {
            riverEmbed
                .setTitle((RiverRace.periodType == "colosseum") ? "__Colosseum__ :" : "__Current river race__ :")
                .setDescription(Race)
                .setImage(chartUrl)
        } catch (e) {
            console.log(e);
        }

        interaction.editReply({ embeds: [riverEmbed] });
    }
}

module.exports = {
    ffriver,
    data: new SlashCommandBuilder()
        .setName('ffriver')
        .setDescription('Replies the current river scores and positions !')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Clan to check')
                .setAutocomplete(true)
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('text_version')
                .setDescription('Show the text version of the command too')),
    async execute(bot, api, interaction) {
        ffriver(bot, api, interaction, null)
    },
};