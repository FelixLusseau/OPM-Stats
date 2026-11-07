const { SlashCommandBuilder } = require('discord.js');
const reports = require('../utils/reports.js');
const functions = require('../utils/functions.js');

async function ffreport(bot, api, interaction, clan) {
    await interaction.reply({ content: "War Report" });
    if (interaction.options.getString('clan')) {
        clan = interaction.options.getString('clan');
        if (functions.isRegisteredClan(bot, interaction, interaction.channel, clan) == false) // Check if the clan is registered
            return
    }
    const channel = interaction.channel; // Get the channel where the command was executed from the interaction
    const guildID = interaction.guildId; // Get the guild ID where the command was executed from the interaction
    reports.report(bot, api, null, false, channel, clan, guildID)
}

module.exports = {
    ffreport,
    data: new SlashCommandBuilder()
        .setName('ffreport')
        .setDescription('Manually trigger the report !')
        .addStringOption(option =>
            option.setName('clan')
                .setDescription('Clan to check')
                .setAutocomplete(true)
                .setRequired(true)),
    async execute(bot, api, interaction) {
        ffreport(bot, api, interaction, null)
    },
};