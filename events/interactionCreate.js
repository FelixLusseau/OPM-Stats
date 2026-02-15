const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(bot, api, interaction) {
        if (interaction.isAutocomplete()) {
            const clan = interaction.options.getString('clan');

            const clans = registeredClans

            // Map the clans to the format Discord expects
            const guildClans = clans.filter(clan => clan.guild === interaction.guild.id);
            const choices = guildClans.map(clan => ({ name: clan.abbr, value: clan.tag }));

            await interaction.respond(choices);
        } else if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                const subcommand = interaction.options.getSubcommand(false);
                const commandDisplay = subcommand ? `${interaction.commandName} ${subcommand}` : interaction.commandName;
                console.log(`\x1b[36m[${new Date().toISOString()}]\x1b[0m Executing ${commandDisplay}`);
                await command.execute(bot, api, interaction);
            } catch (error) {
                const subcommand = interaction.options.getSubcommand(false);
                const commandDisplay = subcommand ? `${interaction.commandName} ${subcommand}` : interaction.commandName;
                console.error(`\x1b[31m[${new Date().toISOString()}]\x1b[0m Error executing ${commandDisplay}`);
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            }
        }
    },
};