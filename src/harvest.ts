// const axios = require('axios').default;
// const { config } = require('./main.js');
import axios from 'axios';
import { config, getDay } from './util/env';

type HarvestUser = {
  name: string;
  fName: string;
  lName: string;
  email: string;
  weeklyCapacity: number;
  timezone: string;
  isContractor: boolean;
}

type ReportUser = {
  user_id: number;
  user_name: string;
  is_contractor: boolean;
  total_hours: number; // float?
  billable_hours: number;
  currency: string;
  billable_aount: number;
}

type CollectedUser = {
  name: string;
  fName: string;
  lName: string;
  email: string;
  slackID: string;
  slackName: string;
}

const getUsers = async() => {
  let harvestUserRequestPage: number = 1;
  const harvestUsersCollection: HarvestUser[] = [];

  // Loop handling Harvest's API pagination results.
  // To deal with the pagination a request must be made per page.
  while (harvestUserRequestPage !== null) {

    // Make a request out to Harvest's API.
    let harvestUsersRaw = await axios.get(`${config.harvest.url}/users?is_active=true&page=${harvestUserRequestPage}`, {headers: config.harvest.headers});


    // Once Harvest returns results, iterate over the users key from the results
    // and add the relevant data to the harvestUsersCollection array.
    for (let i = 0; i < harvestUsersRaw.data.users.length; i++) {
      harvestUsersCollection.push({
        name: `${harvestUsersRaw.data.users[i].first_name} ${harvestUsersRaw.data.users[i].last_name}`,
        fName: harvestUsersRaw.data.users[i].first_name.toLowerCase(),
        lName: harvestUsersRaw.data.users[i].last_name.toLowerCase(),
        email: harvestUsersRaw.data.users[i].email.toLowerCase(),
        weeklyCapacity: harvestUsersRaw.data.users[i].weekly_capacity,
        timezone: harvestUsersRaw.data.users[i].timezone,
        isContractor: harvestUsersRaw.data.users[i].is_contractor
      });
    }

    // Update the looping iterator, if next_page is null, the loop will end.
    harvestUserRequestPage = harvestUsersRaw.data.next_page;
  }

  return harvestUsersCollection;
}

const getTodaysTimeReport = async() => {
  const today: string = getDay().query;
  let todaysReport = await axios.get(`${config.harvest.url}/reports/time/team?from=${today}&to=${today}`, {headers: config.harvest.headers});
  return  todaysReport.data.results;
}

// Check if a given email address should be reported on based on the orgMailsOnly option.
const checkOrgMailOption = (email: string) => {
  if (config.options.orgMailsOnly === true) {
    return email.toLowerCase().includes(config.options.orgMailsTLD);
  }
  if (config.options.orgMailsOnly === false) {
    return true;
  }
}

// Check if a given email address should be reported on based on the ignoreList option.
const checkIgnoreListOption = (email: string) => {
  if (config.options.ignoreList.length > 0) {
    return !config.options.ignoreList.some(ignored => ignored.toLowerCase().includes(email.toLowerCase()));
  }
  else {
    return true;
  }
}

// Check if the given HarvestUser should be reported on based on the includeContractors option.
const checkReportContractorsOption = (user: HarvestUser) => {
  if (config.options.includeContractors === true && user.isContractor === true) {
    return true;
  }
  if (config.options.includeContractors === false && user.isContractor === true) {
    return false;
  }
  if (user.isContractor === false) {
    return true;
  }
}

// Check if the given HarvestUser should be reported on based on the shameFullTimeOnly option.
const checkReportFullTimeOnly = (user: HarvestUser) => {
  if (config.options.shameFullTimeOnly === true && Number((user.weeklyCapacity / 3600)) < config.options.weeklyFullTimeHours) {
    return false;
  } else {
    return true;
  }
}

const getReportableUsers = (harvestUsers: HarvestUser[], timeReport: ReportUser[]) => {
  const reportableUsers : HarvestUser[] = [];

  // For every user in the harvestUsersCollection, check if weekly capacity is greater than 0,
  // then check if the user's email address belongs to the orgMailsTLD.
  // If it is, add them to the reportableUsers array.
  for (let i = 0; i < harvestUsers.length; i++) {
    if (harvestUsers[i].weeklyCapacity > 0) {

      if (checkOrgMailOption(harvestUsers[i].email) && checkIgnoreListOption(harvestUsers[i].email)
        && checkReportContractorsOption(harvestUsers[i]) && checkReportFullTimeOnly(harvestUsers[i])) {
        reportableUsers.push(harvestUsers[i]);
      }
    }
  }

  // Now that reportableUsers are collected, it is time to compare these users' logged time
  // from todaysReport against their calculated daily capacity.
  // For this, a new array will be created by using a reducer function.
  const usersBelowDailyExpectation = reportableUsers.reduce((accumulator, currentValue) => {
    timeReport.find((user: ReportUser) => {
      if ((user.user_name === currentValue.name && user.total_hours < ((currentValue.weeklyCapacity / 3600) / 5))) {
        accumulator.push({
          name: currentValue.name,
          email: currentValue.email.toLowerCase(),
          fName: currentValue.fName,
          lName: currentValue.lName,
          slackID: '',
          slackName: '',
        });
      }
    });

    return accumulator;
  }, [] as CollectedUser[]);

  // Now we have an array of users that are reportable and who have logged time below their daily
  // expected allocation.
  // An unexpected edge case occurs here. Harvest's report does not contain entries for users who
  // have not logged any hours at all, so users who are in the reportableUsers array but not in the
  // todaysReport array must be added to the usersBelowDailyExpectation array.
  for (let i = 0; i < reportableUsers.length; i++) {
    const name = reportableUsers[i].name;
    if (timeReport.filter((user: ReportUser) => user.user_name === name).length > 0) {

    }
    else {
      usersBelowDailyExpectation.push({
        name,
        fName: reportableUsers[i].fName,
        lName: reportableUsers[i].lName,
        email: reportableUsers[i].email.toLowerCase()
      } as CollectedUser);
    }
  }

  return usersBelowDailyExpectation;
}

export { CollectedUser, getUsers, getTodaysTimeReport, getReportableUsers };
