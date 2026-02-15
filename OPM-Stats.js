const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { ClashRoyaleAPI } = require('@varandas/clash-royale-api')
require("dotenv").config();

const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
bot.commands = new Collection();

// Create tmpfiles directory if it doesn't exist
const tmpfilesDir = path.join(__dirname, 'tmpfiles');
if (!fs.existsSync(tmpfilesDir)) {
  fs.mkdirSync(tmpfilesDir, { recursive: true });
  console.log('[INFO] Created tmpfiles/ directory');
}

// Initialize the CR api
global.api = new ClashRoyaleAPI(process.env.CR_TOKEN)

// Connect the bot to Discord
bot.login(process.env.BOT_TOKEN);

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

// Load the commands
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    bot.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Load the events
for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    bot.once(event.name, (...args) => event.execute(bot, api, ...args));
  } else {
    bot.on(event.name, (...args) => event.execute(bot, api, ...args));
  }
}

