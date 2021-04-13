# Harvest Shamebot for Slack

The Harvest Shamebot goes through your organization's [Harvest](http://harvestapp.com)
data and looks for users who haven't submitted all their time for the day. Once
it finds them, it sends a message to Slack to lay on the shame!

If a user wishes to reclaim their dignity, they can click a button attached to
the Slack message to remove themselves from the shame notification.

## Running the Shamebot

The quick version of this section is:

 - Configure Slack App
 - Configure Harvest personal access token
 - Run the Shamebot with `npm run start`.
 - Invite the bot to a Slack channel.
 - Summon the bot with the trigger phrase.

### Dependencies

The application itself has very few dependencies, but there is some legwork that needs
to be done to get things up and running.

#### Harvest

 1. [Create a Personal Access Token](https://id.getharvest.com/developers) for your Harvest account.
 2. Take note of both your Token and your Account ID values, you'll need them to configure the bot.

#### Slack

 1. You must [create a Slack application](https://api.slack.com/apps).
 2. Create a Bot Token for your new Slack application.
 3. Give your Bot Token the following scopes: `channels:history`, `chat:write`, `groups:history`, `mpipm:history`, `users:read`, `users:read.email`.
 4. The Shamebot will be listening on `/slack/events`. Enable Events on the Event Subscriptions tab of your application settings page, provide the URL of the server running the Shamebot and append `/slack/events`.
 5. Use the same URL from step 4 above to enable Interactivity on the Interactivity & Shortcuts tab of your application settings page.
 6. Invite your bot to any channels you'd like it to be posting to.

### Configuration

Clone the repository and run `npm install`.

The Shamebot is configured entirely through a `.env` file. Copy the included `.env.sample` in the repository to `.env` and edit the details to suit you.

##### HARVEST_URL

The Harvest API's URL. Unless Harvest allows some kind of enterprise hosting I don't know about, this should probably be left alone.

##### HARVEST_TOKEN

A Personal Access Token for Harvest.

##### HARVEST_ACCOUNT

The Account ID value for Harvest. You can find this by looking at your Personal Access Token's details.

##### SLACK_BOT_TOKEN

The Bot Token for your Slack application.

##### SLACK_SIGNING_SECRET

Your Slack application's signing secret. This can be found in the Basic Information area of your Slack application's settings under the heading "App Credentials."

##### PORT

The port on which you'd like the Shamebot to run on your server.

##### ORG_MAILS_ONLY

If you only want to report on users who have emails in your organization's domain, set this boolean value to 1.

##### ORG_EMAIL_TLD

If `ORG_MAILS_ONLY` is set to 1, provide the TLD you want to limit on here.

##### SPECIFIC_TEAMS_ONLY

Some organizations use multiple teams in Slack. If this is you, and you only want to shame specific teams, set this boolean value to `1`.

##### SPECIFIC_TEAMS

If you set `SPECIFIC_TEAMS_ONLY` to `1`, provide a comma separated list of Slack team IDs here.

##### PRETEND_IT_NEVER_HAPPENED

One of the features of the Shamebot allows users to remove themselves from the Message of Shame by clicking a button. By default, when a user removes themselves from the shame list, a small contextual postscript message is appended to the message with their Slack username which proclaims to the world that they have regained their dignity and pride by logging their time.

If this option is set to `1`, the postscript will not append any Slack usernames and there will be no record of their shame.

##### IGNORE_LIST

A comma separated list of email addresses to ignore when collecting user accounts for shaming.

##### TRIGGER_PHRASE

The phrase the bot will listen for. If the bot sees this phrase in a channel it is in, it will send the Message of Shame.

This option can be either a string or a regular expression.

The default trigger phrase is: `Shamebot, activate!`

##### WEEKLY_FULL_TIME_HOURS

The weekly hours you consider full-time. For most organizations, this is probably 40.

##### SHAME_FULL_TIME_ONLY

If you have users that have a weekly allocation below the hours set in `WEEKLY_FULL_TIME_HOURS` and you do not want to report on them, set this to `1`.

##### INCLUDE_CONTRACTORS

Set this to `1` if you would like to expand your shame list to include contrators in Harvest.

##### REPORT_TODAY_OR_YESTERDAY

This option allows you to report on either `today` or `yesterday`.

##### EXPLAINER_TEXT

This option sets some small text below the List of Shame, typically used for explaining how the list was pulled together.

##### END_OR_BEGINNING_OF_DAY

This option determines what time of day Shamebot will do its scheduled shaming.

If set to `beginning`, the bot will send out its message every day at 9:30AM.

If set to `end`, the bot will send out its message every day at 5:00PM.

If set to `beginning` and `REPORT_TODAY_OR_YESTERDAY` is set to `yesterday`, the bot will report every day at 9:30AM for the previous day. On Mondays, it will report on the previous Friday.

##### TZ

This value is used to determine the timezone used for the automated shaming. Use a value like, `America/Chicago`.
