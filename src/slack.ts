import config from './util/env';

// Describes the important part of the response from the Slack API when requesting Users.
type SlackUserResponse = {
  members: [] | any;
}

// Describes some of the data for a user returned by Slack's API.
type SlackUser = {
  name: string;
  id: string;
  deleted: boolean;
  is_bot: boolean;
  is_restricted: boolean;
  is_ultra_restricted: boolean;
  team_id: string;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
  }
}

// Describes a Slack user's relevant data to the Shamebot.
type SlackMember = {
  userName: string;
  userID: string;
  email: string;
  fName: string;
  lName: string;
}

// Describes the message block used for printing out the Shame list.
type ShameListBlock = {
  type: string;
  block_id: string;
  text: {
    type: string;
    text: string;
  }
}



// At this point the bot is ready to send the message to Slack, but to actually get someone's
// attention, the bot will need their associated Slack handle.
// To get this we'll do the following:
// - Create an array of slack user objects with emails and @ handles.
// - Compare the final usersBelowDailyExpectation array with the new slackUsers array, matching
//   email addresses then updating the entries in usersBelowDailyExpectation.
const getUsers = async(client: any) => {

  // Make a request for the raw user data from Slack.
  const slackResponse: SlackUserResponse = await client.users.list();
  const slackUsers: SlackUser[] = slackResponse.members;

  // Collect the relevant Slack users into a slackMembers array with only the data that matters.
  const slackMembers = slackUsers.reduce((accumulator, user) => {
    const email = user.profile.email;
    const name = user.name;
    if (user.deleted === false && user.is_bot === false
        && user.is_restricted === false && user.is_ultra_restricted === false
        && typeof user.profile.email !== 'undefined'
        && (config.options.orgMailsOnly ? email.toLowerCase().includes(config.options.orgMailsTLD) : true)
        && (config.options.specificTeamsOnly ? config.options.specificTeams.some(team => team.includes(user.team_id)) : true)) {

      // Push the Slack users that meet all the above requirements into the accumulator array.
      accumulator.push({
        userName: name,
        userID: user.id,
        email: email.toLowerCase(),
        fName: user.profile.first_name,
        lName: user.profile.last_name
      });
    }

    return accumulator;

  }, [] as SlackMember[]);

  return slackMembers;

}

// The Slack Block Kit message template to use for shaming.
// It contains a button for removing yourself from the shame list.
const shameMessageTemplate = (shameList: string, postScript: string) => {
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Team, don\'t forget to report the working hours in Harvest *every day*.\n\nHere is a list of people who didn\'t report their working hours today, *${config.app.todaysDate.displayFormat}*:`,
        },
      },
      {
        type: 'section',
        block_id: 'shame_list',
        text: {
          type: 'mrkdwn',
          text: shameList
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'I\'ve logged my time',
              emoji: false
            },
            value: 'logged_after_shame',
            action_id: 'remove_shame',
            style: 'primary'
          }
        ]
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

// Turn the value of a shame object's key into a string separated by newlines.
// Additionally, this function also turns the Slack user names into links.
const shameObjectToString = (key: any, obj: any[]) => {
  const returner: string[] = [];
  obj.forEach((item) => {
    returner.push(`<@${item[key]}>`);
  });

  const returnString: string = returner.join('\n');

  return returnString;
};

const removeFromShameList = (shameListBlock: ShameListBlock, slackID: string) => shameListBlock.text.text.replace(`<@${slackID}>\n`, '');


export { getUsers, shameMessageTemplate, shameObjectToString, removeFromShameList, ShameListBlock, SlackMember };
