import { config as dotenvconfig } from 'dotenv';
import { resolve } from 'path';

const pathToConfig = '../../.env';

dotenvconfig({ path: resolve(__dirname, pathToConfig) });

const todayQueryFormat = new Date().toISOString().replace('-', '');
const todayDisplayFormat = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// Construct the config object to be used around the application.
let config = {
  app: {
    port: process.env.PORT || 2100,
    todaysDate: {
      queryFormat: todayQueryFormat,
      displayFormat: todayDisplayFormat
    }
  },
  harvest: {
    url: process.env.HARVEST_URL,
    token: process.env.HARVEST_TOKEN,
    accountID: process.env.HARVEST_ACCOUNT,
    headers: {}
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    teamID: process.env.SLACK_TEAM_ID,
  },
  options: {
    triggerPhrase: process.env.TRIGGER_PHRASE || 'harvest shamebot',
    orgMailsOnly: process.env.ORG_MAILS_ONLY ? !!+process.env.ORG_MAILS_ONLY : false,
    orgMailsTLD: process.env.ORG_EMAIL_TLD && process.env.ORG_EMAIL_TLD.includes('.') ? process.env.ORG_EMAIL_TLD : '',
    specificTeamsOnly: process.env.SPECIFIC_TEAMS_ONLY ? !!+process.env.SPECIFIC_TEAMS_ONLY : false,
    specificTeams: process.env.SPECIFIC_TEAMS && process.env.SPECIFIC_TEAMS.includes(',') ? process.env.SPECIFIC_TEAMS.split(',') : [],
    pretendItNeverHappened: process.env.PRETEND_IT_NEVER_HAPPENED ? !!+process.env.PRETEND_IT_NEVER_HAPPENED : false,
    ignoreList: process.env.IGNORE_LIST && process.env.IGNORE_LIST.includes(',') ? process.env.IGNORE_LIST.split(',') : [],
  }
}

config.harvest.headers = {
  authorization: `Bearer ${config.harvest.token}`,
  'Harvest-Account-Id': `${config.harvest.accountID}`
}

export default config;
