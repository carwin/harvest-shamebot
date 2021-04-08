const axios = require('axios').default;
const dotenv = require('dotenv').config();

const harvestURL = process.env.HARVEST_URL;
const harvestToken = process.env.HARVEST_TOKEN;
const harvestAccount = process.env.HARVEST_ACCOUNT;
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

const today = `${y}${m}${d}`;

const harvestHeaders = {
  headers: {
    authorization: `Bearer ${harvestToken}`,
    'Harvest-Account-Id': `${harvestAccount}`
  }
}

const getUsersPageCount = () => {
  return axios.get(`${harvestURL}/users?is_active=true`, harvestHeaders)
    .then((response) => response.data.total_pages);
}

const getUsers = (page) => {
  return axios.get(`${harvestURL}/users?is_active=true&page=${page}`, harvestHeaders);
}

const getTeamDayLog = () => {
  return axios.get(`${harvestURL}/reports/time/team?from=${today}&to=${today}`, harvestHeaders);
}

const prepareHarvestAPICalls = (pageCount) => {
  const calls = [];

  // Push a getUsers call to the calls array for every page in pageCount.
  for (let i = 1; i < pageCount + 1; i++) {
    calls.push(getUsers(i));
  }

  calls.push(getTeamDayLog());
  return calls;
}


// First, start a Promise to get the total page count
getUsersPageCount()
  // Once the page count Promise is resolved, then run all Promises collected
  // by prepareHarvestAPICalls()
  .then((userPageCount) => {
    Promise.all(prepareHarvestAPICalls(userPageCount))
      .then((results) => {
        // Collect the total count of returned results.
        const resultsCount = results.length - 1;
        // Create an empty array to house Harvest users.
        let harvestUsers = [];
        // Every index from 0 to resultsCount should be a call to getUsers(index) where
        // the index is the page number for the API's paginated results.
        // Concatenate into the harvestUsers array instantiated above.
        for (let i = 0; i < resultsCount; i++) {
          harvestUsers = harvestUsers.concat(results[i].data.users);
        }
        // Today's report is always the last one that gets added during prepareHarvestAPICalls().
        const todaysReport = results[resultsCount].data.results

        // Initialize another empty array to house the users that should be reported on.
        const reportableUsers = [];

        // For every user that was returned by Harvest's API, check if their weekly_capacity
        // is greater than 0. If so, they can be reported on.
        for (let i = 0; i < harvestUsers.length; i++) {
          if (harvestUsers[i].weekly_capacity > 0) {
            reportableUsers.push(harvestUsers[i]);
          }
        }

        // A reducer that collects users whose daily logged hours are under their daily capacity.
        const under = reportableUsers.reduce((arr, currentValue, index) => {
          todaysReport.find(u => {
            if ((u.user_name === `${currentValue.first_name} ${currentValue.last_name}` && u.total_hours < ((currentValue.weekly_capacity / 3600) / 5))) {
              arr.push({name: `${currentValue.first_name} ${currentValue.last_name}`, email: currentValue.email});
            }
          });
          return arr;
        }, []);

        // Find users that are reportable, but are not showing up on the report
        // at all, in this scenario they have billed exactly 0 hours so the
        // report will not return them.
        for (let i = 0; i < reportableUsers.length; i++) {
          if (todaysReport.filter(e => e.user_name === `${reportableUsers[i].first_name} ${reportableUsers[i].last_name}`).length > 0) {
          } else {
            under.push({name: `${reportableUsers[i].first_name} ${reportableUsers[i].last_name}`, email: reportableUsers[i].email});
            console.log(reportableUsers[i]);
          }
        }

        console.log('These users have not reported all hours: ', under);
        console.log('Today: ', today);
        console.log('total reportable users: ', reportableUsers.length);
        return under;
      });

});
