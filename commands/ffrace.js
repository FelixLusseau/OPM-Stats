const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const functions = require('../utils/functions.js');

async function ffrace(bot, api, interaction, channel, clan, report) {
    // Check if the command was run by an interaction or a scheduled message
    if (interaction != null) {
        await interaction.deferReply();
        if (interaction.options.getString('clan')) {
            clan = interaction.options.getString('clan');
            if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
                return
        }
    }

    const raceEmbed = functions.generateEmbed(bot);
    let Labels = [];
    let Datas = [];
    let Race = "";

    let RiverRace = null
    try {
        RiverRace = await api.getClanCurrentRiverRace(clan)
    } catch (error) {
        functions.errorEmbed(bot, interaction, channel, error)
        return
    }

    let clans = RiverRace.clans
    // Chart data processing
    for (let i = 0; i < clans.length; i++) {
        if (RiverRace.periodType != "colosseum" && clans[i].fame >= 10000) { // If the clan has already reached 10k fame in normal days, skip it
            continue
        }
        let labels = clans[i].name
        Labels.push(labels);
        let data = 0
        if (RiverRace.periodType == "colosseum")
            data = clans[i].fame
        else
            data = clans[i].periodPoints
        Datas.push(data);

        /* api.getClanByTag(clans[i].tag)
        .then((clan) => {
            //console.log(clan)
            return clan
        })
        .catch((err) => {
            console.log("CR-API error : ", err)
        })
        let clan = await api.getClanByTag(clans[i].tag) */

        /* for (let i = 0; i < badgesData.length; i++) {
            //console.log(badgesData[i].id)
            if (badgesData[i].id == clan.badgeId) {
                Race += ":https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/badges/" + badgesData[i].name + ".png:"
                break
            }
        } */
    }
    // Sort clans by fame or points depending on the period type
    if (RiverRace.periodType == "colosseum")
        clans.sort((a, b) => (a.fame < b.fame) ? 1 : -1)
    else
        clans.sort((a, b) => (a.periodPoints < b.periodPoints) ? 1 : -1)

    let data = {}
    // Dictionary for estimated positions and other data calculation
    for (let i = 0; i < clans.length; i++) {
        let decksRemaining = 200
        let playersRemaining = 50
        for (let j = 0; i < clans[i].participants.length; j++) {
            if (clans[i].participants[j] == undefined) // strange bug to correct
                break
            decksRemaining -= clans[i].participants[j].decksUsedToday
            if (clans[i].participants[j].decksUsedToday != 0)
                playersRemaining -= 1
        }
        ratio = await functions.ratio(RiverRace, decksRemaining, i) // Calculate the ratio of the clan
        const estimate = Math.floor(ratio) * ((RiverRace.periodType == "colosseum") ? 800 : 200)// Invert of ratio calculation where the points are the unknown value

        data[clans[i].tag] = { "decksRemaining": decksRemaining, "playersRemaining": playersRemaining, "ratio": ratio, "estimate": estimate, "estimatedPosition": 0 }
    }

    // Convert the data object to an array of arrays
    let dataArray = Object.entries(data);

    // Sort the array by estimate value
    dataArray.sort((a, b) => (b[1].estimate - a[1].estimate));

    // Convert it back to an object
    let sortedData = Object.fromEntries(dataArray);

    // Calculate the estimated position of the clan
    for (let i = 0; i < dataArray.length; i++) {
        if (i > 0 && dataArray[i][1].estimate == dataArray[i - 1][1].estimate) {
            sortedData[dataArray[i][0]].estimatedPosition = sortedData[dataArray[i - 1][0]].estimatedPosition
            continue
        }
        else
            sortedData[dataArray[i][0]].estimatedPosition = i + 1
        switch (sortedData[dataArray[i][0]].estimatedPosition) {
            case 1:
                sortedData[dataArray[i][0]].estimatedPosition = "1st"
                break
            case 2:
                sortedData[dataArray[i][0]].estimatedPosition = "2nd"
                break
            case 3:
                sortedData[dataArray[i][0]].estimatedPosition = "3rd"
                break
            default:
                sortedData[dataArray[i][0]].estimatedPosition = sortedData[dataArray[i][0]].estimatedPosition + "th"
                break
        }
    }
    // console.log(sortedData);

    let clanPos = 0
    for (let i = 0; i < clans.length; i++) {
        const decksRemaining = sortedData[clans[i].tag].decksRemaining
        const playersRemaining = sortedData[clans[i].tag].playersRemaining

        let points = 0
        if (RiverRace.periodType == "colosseum")
            points = clans[i].fame
        else
            points = clans[i].periodPoints

        const ratio = sortedData[clans[i].tag].ratio
        const estimate = sortedData[clans[i].tag].estimate

        if (RiverRace.periodType != "colosseum" && clans[i].fame >= 10000) {
            Race += "- __" + (clans[i].tag == clan ? "**" + clans[i].name + "**" : clans[i].name) + "__ : <:Reinearcheres:1216136457601683588> War finished \n\n"
            continue
        }
        // Make the string with the clan name, tag, points, ratio, decks remaining and players remaining
        let ratioEmote = functions.ratioEmote(ratio)

        Race += "- __" + (clans[i].tag == clan ? "**" + clans[i].name + "**" : clans[i].name) // Bold the clan name if it's the clan the user asked for
            + "__ :\n<:Hashtag:1186369411439923220> Tag : " + clans[i].tag
            + "\n<a:Colored_arrow:1186367114190270516> Pts : " + points
            + "\n" + ratioEmote + " Ratio : **" + ratio
            + "**\n<a:Valider:1186367102936952952> Estimate : **" + estimate
            + "**\n<a:FlechecoloreeH:1216130989663846420> Estimated position : **" + sortedData[clans[i].tag].estimatedPosition
            + "**\n<:Mini_Pekka:1186367104962809947> Attacks : " + decksRemaining
            + "\n<a:Chevalier:1186367120083263594> Players : " + playersRemaining + "\n\n"
        if (clans[i].tag == clan)
            clanPos = i + 1
    }

    // Race = Race.replace(/_/g, '\\_') // Escape the underscores to prevent undesired italic formatting

    let max = 0
    // Set the max value of the chart depending on the period type
    if (RiverRace.periodType == "colosseum")
        max = 180000
    else
        max = 45000

    // Chart construction
    Datas = [Datas]
    const chart = functions.barChart('horizontalBar', Labels, Datas, null, max);
    const encodedChart = encodeURIComponent(JSON.stringify(chart));
    const chartUrl = `https://quickchart.io/chart?c=${encodedChart}`;

    const rand = Math.random().toString(36).slice(2); // Generate a random string to avoid the image cache
    try {
        raceEmbed
            .setTitle("__Current war day" + ((RiverRace.periodType == "colosseum") ? " (Colosseum)__ " : "__ ") + ":")
            .setDescription(Race)
            .setImage(chartUrl)
    } catch (e) {
        console.log(e);
    }

    // If the interaction is not null, edit the reply deferred before
    if (interaction != null)
        interaction.editReply({ embeds: [raceEmbed] });
    else if (report == false) {
        try {
            channel.send({ embeds: [raceEmbed] });
        } catch (error) {
            console.error("FFRace error :" + error)
        }
    }

    return clanPos
}

module.exports = {
    ffrace,
    data: new SlashCommandBuilder()
        .setName('ffrace')
        .setDescription('Replies the current race !')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Clan to check')
                .setAutocomplete(true)
                .setRequired(true)),
    async execute(bot, api, interaction) {
        ffrace(bot, api, interaction, null, null, false)
    }
};
