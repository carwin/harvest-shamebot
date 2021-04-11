const axios = require('axios').default;
const dotenv = require('dotenv').config();
const { App } = require('@slack/bolt');

const config = {
  app: {
    port: process.env.PORT || 2100
  },
  harvest: {
    url: process.env.HARVEST_URL,
    token: process.env.HARVEST_TOKEN,
    accountID: process.env.HARVEST_ACCOUNT,
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    teamID: process.env.SLACK_TEAM_ID,
  },
  options: {
    orgMailsOnly: !!+process.env.ORG_MAILS_ONLY || false,
    orgMailsTLD: process.env.ORG_EMAIL_TLD && process.env.ORG_EMAIL_TLD.includes('.') ? process.env.ORG_EMAIL_TLD : false,
    specificTeamsOnly: !!+process.env.SPECIFIC_TEAMS_ONLY || false,
    specificTeams: process.env.SPECIFIC_TEAMS && process.env.SPECIFIC_TEAMS.includes(',') ? process.env.SPECIFIC_TEAMS.split(',') : [],
    pretendItNeverHappened: !!+process.env.PRETEND_IT_NEVER_HAPPENED || false,
    ignoreList: process.env.IGNORE_LIST && process.env.IGNORE_LIST.includes(',') ? process.env.IGNORE_LIST.split(',') : [],
  }
}

console.log('options: ', config.options);

// Prepare the dates we'll be using for Harvest queries and output.
const date = new Date();
const y = date.getFullYear();
let d = date.getDate(),
    m = date.getMonth() + 1;
if (d <= 9) {
  d = `0${d}`
}
if (m <= 9) {
  m = `0${m}`
}

const todayQueryFormat = `${y}${m}${d}`;
const todayDisplayFormat = `${m}/${d}/${y}`;

// Initialize the application.
const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret
});

// Prepare a headers object to send with the Axios requests to Harvest.
const harvestQueryHeaders = {
  headers: {
    authorization: `Bearer ${config.harvest.token}`,
    'Harvest-Account-Id': `${config.harvest.accountID}`
  }
}



// Begin querying and sorting the data into something useable.
const prepareShame = async(client) => {
  let harvestUserRequestPage = 1;
  const harvestUsersCollection = [];

  // This loop handles the Harvest API's paginated results, we must make a request per page.
  // Harvest limits the results per request to 100.
  while (harvestUserRequestPage !== null) {

    // This is the actual request out to Harvest.
    let harvestUsersRaw = await axios.get(`${config.harvest.url}/users?is_active=true&page=${harvestUserRequestPage}`, harvestQueryHeaders);

    // Once Harvest returns results, iterate over the users key from the results
    // and add the relevant data to the harvestUsersCollection array.
    for (let i = 0; i < harvestUsersRaw.data.users.length; i++) {
      harvestUsersCollection.push({
        name: `${harvestUsersRaw.data.users[i].first_name} ${harvestUsersRaw.data.users[i].last_name}`,
        email: harvestUsersRaw.data.users[i].email.toLowerCase(),
        weekly_capacity: harvestUsersRaw.data.users[i].weekly_capacity,
        timezone: harvestUsersRaw.data.users[i].timezone,
        is_contractor: harvestUsersRaw.data.users[i].is_contractor
      });
    }

    // Update the looping iterator, if next_page is null, the loop will end.
    harvestUserRequestPage = harvestUsersRaw.data.next_page;
  }

  // The request grabs the daily time report from Harvest.
  let todaysReport = await axios.get(`${config.harvest.url}/reports/time/team?from=${todayQueryFormat}&to=${todayQueryFormat}`, harvestQueryHeaders);
  todaysReport = todaysReport.data.results;

  // Create an array to house the users that should be reported on.
  // The criteria for being 'reportable' are:
  // - User is active (handled by the getUsers request earlier).
  // - The user has a weekly_capacity value greater than 0.
  // - @TODO: The user is not in the exclusion list.
  const reportableUsers = [];

  // For every user in the harvestUsersCollection, check if weekly capacity is greater than 0,
  // then check if the user's email address belongs to the orgMailsTLD.
  // If it is, add them to the reportableUsers array.
  for (let i = 0; i < harvestUsersCollection.length; i++) {
    if (harvestUsersCollection[i].weekly_capacity > 0
        && (config.options.orgMailsOnly ? harvestUsersCollection[i].email.toLowerCase().includes(config.options.orgMailsTLD) : true)
        && (config.options.ignoreList.length > 0 ? !config.options.ignoreList.some(email => email.toLowerCase().includes(harvestUsersCollection[i].email.toLowerCase())) : true)
    ) {
      reportableUsers.push(harvestUsersCollection[i]);
    }
  }

  // Now that reportableUsers are collected, it is time to compare these users' logged time
  // from todaysReport against their calculated daily capacity.
  // For this, a new array will be created by using a reducer function.
  const usersBelowDailyExpectation = reportableUsers.reduce((accumulator, currentValue) => {
    todaysReport.find(user => {
      if ((user.user_name === currentValue.name && user.total_hours < ((currentValue.weekly_capacity / 3600) / 5))) {
        accumulator.push({name: currentValue.name, email: currentValue.email.toLowerCase()});
      }
    });

    return accumulator;
  }, []);

  // Now we have an array of users that are reportable and who have logged time below their daily
  // expected allocation.
  // An unexpected edge case occurs here. Harvest's report does not contain entries for users who
  // have not logged any hours at all, so users who are in the reportableUsers array but not in the
  // todaysReport array must be added to the usersBelowDailyExpectation array.
  for (let i = 0; i < reportableUsers.length; i++) {
    const name = reportableUsers[i].name;
    if (todaysReport.filter(user => user.user_name === name).length > 0) {

    }
    else {
      usersBelowDailyExpectation.push({ name, email: reportableUsers[i].email.toLowerCase() });
    }
  }

  // At this point the bot is ready to send the message to Slack, but to actually get someone's
  // attention, the bot will need their associated Slack handle.
  // To get this we'll do the following:
  // - Create an array of slack user objects with emails and @ handles.
  // - Compare the final usersBelowDailyExpectation array with the new slackUsers array, matching
  //   email addresses then updating the entries in usersBelowDailyExpectation.
  let slackUsers = await client.users.list();
  slackUsers = slackUsers.members;
  const slackMembers = [];

  // Collect the relevant Slack users into the slackMembers array with only the data that matters.
  for (let i = 0; i < slackUsers.length; i++) {
    const email = slackUsers[i].profile.email;
    if (slackUsers[i].deleted === false &&               // User isn't deleted.
        slackUsers[i].is_bot === false &&                // User is not a bot user.
        slackUsers[i].is_restricted === false &&         // User is not a guest
        slackUsers[i].is_ultra_restricted === false &&   // User is not a single channel guest.
        // slackUsers[i].profile.last_name.length > 0 &&        // User definitely has a last name.
        typeof email !== 'undefined' &&
        (config.options.orgMailsOnly ? email.toLowerCase().includes(config.options.orgMailsTLD) : true) &&
        (config.options.specificTeamsOnly ? config.options.specificTeams.some(team => team.includes(slackUsers[i].team_id)) : true)) {

      // Push the Slack users that meet all the requirements into the slackMembers array.
      slackMembers.push({ user_id: slackUsers[i].name, email: slackUsers[i].profile.email });
    }
  }

  for (let i = 0; i < usersBelowDailyExpectation.length; i++) {
    slackMembers.find(member => {
      if (usersBelowDailyExpectation[i].email.toLowerCase() === member.email.toLowerCase()) {
        usersBelowDailyExpectation[i].slack_id = member.user_id;
      }
    })
  }

  console.log('total users: ', harvestUsersCollection.length);
  console.log('total reportable users: ', reportableUsers.length);

  return usersBelowDailyExpectation;
}

const prepareShameListForSlack = (users) => {
  let returnString = '';
  for (let i = 0; i < users.length; i++) {
    returnString += `${users[i].slack_id}\n`;
  }

  return returnString;
}

// Send the official shame message to Slack.
app.message('shame', async({ message, say, client }) => {

  // Collect the users who haven't met their expected hours.
  const usersBelowDailyExpectation = await prepareShame(client);
  // Turn them into a string.
  const shameList = prepareShameListForSlack(usersBelowDailyExpectation);
  // Add a postScript message, this will be added as a 'context' block.
  // See Slack's documentation around Block Kit.
  const postScript = '*Shame has been applied to this message.* \nIf you would like to not have shame, log your time in Harvest and click the button above.';

  // Send the message.
  await say(slackShameMessage(shameList, postScript));
});

// The Slack Block Kit message template to use for shaming.
// It contains a button for removing yourself from the shame list.
const slackShameMessage = (shameList, postScript) => {
  return {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `Team, don\'t forget to report the working hours in Harvest *every day*.\n\nHere is a list of people who didn\'t report their working hours today, ${todayDisplayFormat}: \n`,
        }
      },
      {
        type: 'section',
        block_id: 'shame_list',
        text: {
          type: 'mrkdwn',
          text: shameList,
        }
      },
      {
        "type": "divider"
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "I've logged my time",
              "emoji": false
            },
            "value": "logged_after_shame",
            "action_id": "remove_shame",
            "style": 'primary',
          }
        ]
      },
      {
        "type": "divider"
      },
      {
        type: 'context',
        block_id: 'shame_list_post_script',
        elements: [
          {
            type: 'image',
            image_url: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ftse2.mm.bing.net%2Fth%3Fid%3DOIP.qaK2iVSf2wcVkixruiXs2QAAAA%26pid%3DApi&f=1',
            alt_text: 'pointing finger'
          },
          {
            type: 'mrkdwn',
            text: postScript
          }
        ]
      }
    ]
  }
};

// Given a comma separated string of slack usernames, find and remove a particular one.
const removeFromShameList = (shameListBlock, slack_id) => shameListBlock.text.text.replace(`${slack_id}\n`, '');

// When a user clicks the I've Logged My Time button in the bot's message, update the message instead
// of posting another comment.
app.action('remove_shame', async ({ body, action, ack, respond, say, client }) => {
  // Acknowledge that someone pressed the button to remove their shame.
  await ack();
  console.log(`@${body.user.name} is attempting to remove their shame by clicking the button.`);

  // The actionUser is the Slack user that clicked the button.
  const actionUser = body.user.name;
  const actionUserID = body.user.id;
  // Pull the shameList object out of the current message body.
  let shameList = body.message.blocks.find(block => block.block_id === 'shame_list');
  // Pull the postScript object out of the current message body, then reassign the variable
  // to the nested string value deep down inside.
  let postScript = body.message.blocks.find(block => block.block_id === 'shame_list_post_script');
  postScript = postScript.elements[1].text;

  // Reassign the shameList string to a copy of itself, with the current actionUser removed.
  shameList = removeFromShameList(shameList, actionUser);

  // Update the postScript string to include a cheeky phrase about those who were shamed but
  // are no longer.
  // If the configuration option "pretendItneverHappened" is set to true, do not update the
  // postScript of the message, some groups are more sensitive than others.
  if (!config.options.pretendItNeverHappened) {
    // If the postScript includes an `@` character, but the actionUser isn't in the string:
    if (postScript.includes('@') && !postScript.includes(`${actionUserID}`)) {
      postScript = postScript + `, <@${actionUser}>`
    }
    // If the postScript does not include an `@` character, this must be the first one:
    else if (!postScript.includes('@')){
      postScript = postScript + `\nThese users have regained their pride and dignity: <@${actionUser}>`
    }
    else {
      console.log(`@${body.user.name} has already had their shame removed.`);
    }
  }

  // Update the Slack message.
  await respond(slackShameMessage(shameList, postScript));
});


// Run the application on a particular port:
(async () => {
  // App starting

  await app.start(config.app.port);

  console.log('Harvest Shamebot is online.');

})();
