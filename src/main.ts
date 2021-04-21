// @ts-ignore
import schedule from 'node-schedule';
import { App } from '@slack/bolt';
import { config, getDay } from './util/env';
import { isGenericMessageEvent } from './util/helpers'
import * as harvest from './harvest';
import * as slack from './slack';

// Instantiate the Bolt application.
const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret
});


// The primary app function:
(async () => {
  // Run the application on a particular port:
  await app.start(config.app.port as number);

  // Log some useful messages:
  console.log('Harvest Shamebot is online...');
  console.log(`Shamebot is set to report on ${config.options.reportDay}'s time: ${getDay().display}`)
  console.log('Shamebot is listening for the trigger phrase: ', config.options.triggerPhrase);

  // Set up a scheduled run of the Message of Shame:
  // First create the rule, this uses node-schedule which implements cron-parser.
  const scheduleRule = new schedule.RecurrenceRule();
  scheduleRule.dayOfWeek = [1,2,3,4,5]; // Monday through Friday.
  scheduleRule.tz = config.options.tz;  // Pull the Timezone string from the options.

  // If the bot is configured to run at the beginning of the day, have it go at 9:30am.
  if (config.options.endOrBeginningOfDay === 'beginning') {
    scheduleRule.hour = 9;
    scheduleRule.minute = 30;
  }
  // If the bot is configured to run at the end of the day, have it go at 5:30pm.
  if (config.options.endOrBeginningOfDay === 'end') {
    scheduleRule.hour = 17;
    scheduleRule.minute = 30;
  }

  // Create the job.
  const job = schedule.scheduleJob(scheduleRule, () => {
    console.log(`Sending automated message to ${config.options.scheduledChannel} in Slack.`);
    shame(app.client);
    console.log(`The next scheduled Shamebot message is set for ${nextRunTime} on ${nextRunDay}, ${nextRunDate}`);
  });

  // Capture when the next expected run is expected:
  const nextRun = job.nextInvocation();
  const nextRunTime = nextRun.toDate().toLocaleDateString('en-US', {timeStyle: 'short'});
  const nextRunDate = nextRun.toDate().toLocaleDateString('en-US', {dateStyle: 'long'});
  const nextRunDay = nextRun.toDate().toLocaleDateString('en-US', {weekday: 'long'});

  // Log out the next scheduled automated message's info:
  if (nextRun.toDate() > new Date()) {
    console.log(`The next scheduled Shamebot message is set for ${nextRunTime} on ${nextRunDay}, ${nextRunDate}`);
  }

})();

// @ts-ignore
const shame = async(client) => {
  client.token = config.slack.botToken;
  const channel = config.options.scheduledChannel;

  // Collect the users who haven't met their expected hours.
  const users = await prepareShame(client);
  // Turn them into a newline separated string.
  const shameString = slack.shameObjectToString('slackID', users);
  // Add a postScript message, this will be added as a 'context' block.
  // See Slack's documentation around Block Kit.
  const postScript = '*Shame has been applied to this message.* \nIf you would like to not have shame, log your time in Harvest and click the button above.';


  const body = slack.shameMessageTemplate(shameString, postScript);

  await client.chat.postMessage({
    blocks: body.blocks,
    channel: channel,
  });

}

// Loop over the collected Harvest users and look for matching emails from that
// list in the slackUsers list. When a match is found, push the slackID value
// from slackUsers into the match found in collectedHarvestUsers.
const matchUserAccounts = (slackUsers: slack.SlackMember[], harvestUsers: harvest.CollectedUser[]) => {
  const matchedUsers: harvest.CollectedUser[] = [];
  harvestUsers.forEach(hUser => {
    slackUsers.find(sUser => {
      if ((hUser.email === sUser.email) || (`${hUser.fName} ${hUser.lName}` === `${sUser.fName} ${sUser.lName}`)) {
        hUser.slackID = sUser.userID;
        hUser.slackName = sUser.userName;
        matchedUsers.push(hUser);
      }
    });
  });
  return matchedUsers;
}

// Begin querying and sorting the data into something useable.
const prepareShame = async(client: any) => {

  // Harvest Data
  const harvestUsers  = await harvest.getUsers();
  const harvestReport = await harvest.getTodaysTimeReport();
  const collectedHarvestUsers = harvest.getReportableUsers(harvestUsers, harvestReport);

  // Slack Data
  const slackUsers = await slack.getUsers(client);

  // Combined user data
  const users = matchUserAccounts(slackUsers, collectedHarvestUsers);

  return users;
}


// Respond to the triggerPhrase option:
// If the bot is in a channel and sees the triggerPhrase, it should respond with the Message of Shame.
app.message(config.options.triggerPhrase, async({ message, say, client }) => {
  // Collect the users who haven't met their expected hours.
  const users = await prepareShame(client);
  // Turn them into a newline separated string.
  const shameString = slack.shameObjectToString('slackID', users);
  // Add a postScript message, this will be added as a 'context' block.
  // See Slack's documentation around Block Kit.
  const postScript = '*Shame has been applied to this message.* \nIf you would like to not have shame, log your time in Harvest and click the button above.';

  if (!isGenericMessageEvent(message)) return;

  // Send the message!
  const body = slack.shameMessageTemplate(shameString, postScript);
  // @ts-ignore
  await say(body);
});


// Respond to a config request phrase:
app.message('Shamebot, show config', async({ message, say, client }) => {
  let configString : string = JSON.stringify(config, null, 2);
  await say('```' + configString + '```');
});

// When a user clicks the I've Logged My Time button in the bot's message, update the message instead
// of posting another comment.
// @TODO: There are quite a few @ts-ignore comments in here, mainly because I don't know how to resolve
//        the issues the compiler/transpiler is throwing. The code functions perfectly, but the TS
//        definitions coming from @slack/bolt are either out of whack or need to be expressed somehow.
app.action('remove_shame', async ({ body, ack, respond }) => {
  // Acknowledge that someone pressed the button to remove their shame.
  await ack();
  // @ts-ignore
  console.log(`@${body.user.name} is attempting to remove their shame by clicking the button.`);

  // The actionUser is the Slack user that clicked the button.
  // @ts-ignore
  const actionUser = body.user.name;
  const actionUserID = body.user.id;
  // Pull the shameList object out of the current message body.
  // @ts-ignore
  let shameList = body.message.blocks.find((block: slack.ShameListBlock) => block.block_id === 'shame_list');
  // Pull the postScript object out of the current message body, then reassign the variable
  // to the nested string value deep down inside.
  // @ts-ignore
  let postScript = body.message.blocks.find(block => block.block_id === 'shame_list_post_script');
  postScript = postScript.elements[1].text;

  // Reassign the shameList string to a copy of itself, with the current actionUser removed.
  shameList = slack.removeFromShameList(shameList, actionUserID);

  // Update the postScript string to include a cheeky phrase about those who were shamed but
  // are no longer.
  // If the configuration option "pretendItneverHappened" is set to true, do not update the
  // postScript of the message, some groups are more sensitive than others.
  if (!config.options.pretendItNeverHappened) {
    // If the postScript includes an `@` character, but the actionUser isn't in the string:
    if (postScript.includes('@') && !postScript.includes(`${actionUserID}`)) {
      postScript = postScript + `, <@${actionUser}>`
      // @ts-ignore
      console.log(`Removed @${body.user.name}'s shame.`);
    }
    // If the postScript does not include an `@` character, this must be the first one:
    else if (!postScript.includes('@')){
      postScript = postScript + `\nThese users have regained their pride and dignity: <@${actionUser}>`
      // @ts-ignore
      console.log(`Removed @${body.user.name}'s shame.`);
    }
    else {
      // @ts-ignore
      console.log(`@${body.user.name} has already had their shame removed.`);
    }
  }

  // Update the Slack message.
  // @ts-ignore
  await respond(slack.shameMessageTemplate(shameList, postScript));
});
