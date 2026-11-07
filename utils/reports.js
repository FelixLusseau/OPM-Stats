const ffattacks = require('../commands/ffattacks');
const ffresults = require('../commands/ffresults');
const ffrace = require('../commands/ffrace');
const { EmbedBuilder } = require('discord.js');
const functions = require('../utils/functions.js')

async function report(bot, api, interaction, pingBool, channel, clan, guildID) {
    // Get the attacks and results from the ffattacks and ffresults functions
    const attacks = await ffattacks.ffattacks(bot, api, interaction, pingBool, channel, clan, guildID)
    const results = await ffresults.ffresults(bot, api, interaction, clan)
    const race = await ffrace.ffrace(bot, api, interaction, channel, clan, true)

    const reportEmbed = functions.generateEmbed(bot);
    reportEmbed
        .setTitle('**__Daily War Report__ :**')
        .setDescription(
            '**__Clan position__ : ' + race.position + '**\n'
            + '\n--------------------------------------\n\n'
            + '**__War result__ :**\n'
            + race.summary
            + '\n\n--------------------------------------\n\n'
            + '**__Players\' attacks__ :**\n'
            + attacks
            + '\n--------------------------------------\n'
            + '\n**__Players\' war results__ :**\n'
            + results
        )
    try {
        channel.send({ embeds: [reportEmbed] });
    } catch (error) {
        console.error("Report error :" + error)
    }
}

module.exports = {
    report
}
