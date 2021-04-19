import { config as dotenvconfig } from 'dotenv';
import { resolve } from 'path';

const pathToConfig = '../../.env';

dotenvconfig({ path: resolve(__dirname, pathToConfig) });

// Configure the various uses of the date using the env variable REPORT_TODAY_OR_YESTERDAY.
let today: string | Date = new Date();
let yesterday: string | Date = new Date(today);

// backReportDays is an array of weekday names on which we should report report the previous Friday.
const backReportDays = ['Saturday', 'Sunday', 'Monday'];
const currentWeekday = today.toLocaleDateString('en-US', {weekday: 'long'});

// If currentWeekday is in the backReportDays array, set the bot's concept of 'yesterday' to be last Friday.
// Otherwise, yesterday is just the day before today.
if (backReportDays.some(e => e === currentWeekday)) {
  yesterday.setDate(yesterday.getDate() - 3);
} else {
  yesterday.setDate(yesterday.getDate() - 1);
}

let queryDateFormat;
let displayDateFormat;

// If the app is configured to report yesterday, set queryDateFormat and displayDateFormat to yesterday.
if (process.env.REPORT_TODAY_OR_YESTERDAY === 'yesterday') {
  queryDateFormat = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
  displayDateFormat = yesterday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
// If the app is configured to report today, set queryDateFormat and displayDateFormat to today.
else {
  queryDateFormat = today.toISOString().slice(0, 10).replace(/-/g, '');
  displayDateFormat = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Handle the Trigger Phrase option:
// The bot should support regular expressions as a trigger phrase
// because Bolt supports it and its cool. To do that there needs
// to be some processing.
const handleTriggerPhrase = (config : string) => {
  let phrase : string | RegExp = config;

  if (config && config.startsWith('/') && config.endsWith('/')) {
    // If this condition matches, assume the phrase should be a RegExp.
    // Strip the ends off of the phrase so there aren't doubles. RegExp()'s constructor
    // adds beginning and ending slashes.
    phrase = new RegExp(phrase.substring(0, phrase.length - 1).substring(1));
  }

  return phrase;
}

// Construct the config object to be used around the application.
let config = {
  app: {
    port: process.env.PORT || 2100,
    todaysDate: {
      queryFormat: queryDateFormat,
      displayFormat: displayDateFormat,
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
    triggerPhrase: process.env.TRIGGER_PHRASE ? handleTriggerPhrase(process.env.TRIGGER_PHRASE) : 'Shamebot, activate!',
    orgMailsOnly: process.env.ORG_MAILS_ONLY ? !!+process.env.ORG_MAILS_ONLY : false,
    orgMailsTLD: process.env.ORG_EMAIL_TLD && process.env.ORG_EMAIL_TLD.includes('.') ? process.env.ORG_EMAIL_TLD : '',
    specificTeamsOnly: process.env.SPECIFIC_TEAMS_ONLY ? !!+process.env.SPECIFIC_TEAMS_ONLY : false,
    specificTeams: process.env.SPECIFIC_TEAMS && process.env.SPECIFIC_TEAMS.includes(',') ? process.env.SPECIFIC_TEAMS.split(',') : [],
    pretendItNeverHappened: process.env.PRETEND_IT_NEVER_HAPPENED ? !!+process.env.PRETEND_IT_NEVER_HAPPENED : false,
    ignoreList: process.env.IGNORE_LIST && process.env.IGNORE_LIST.includes(',') ? process.env.IGNORE_LIST.split(',') : [],
    includeContractors: !!Number(process.env.INCLUDE_CONTRACTORS),
    shameFullTimeOnly: !!Number(process.env.SHAME_FULL_TIME_ONLY),
    weeklyFullTimeHours: Number(process.env.WEEKLY_FULL_TIME_HOURS),
    explainerText: process.env.EXPLAINER_TEXT,
    tz: process.env.TZ,
    endOrBeginningOfDay: process.env.END_OR_BEGINNING_OF_DAY,
    scheduledChannel: process.env.SCHEDULED_CHANNEL,
  }
}

config.harvest.headers = {
  authorization: `Bearer ${config.harvest.token}`,
  'Harvest-Account-Id': `${config.harvest.accountID}`
}

export default config;
