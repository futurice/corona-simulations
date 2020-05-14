const fetch = require('node-fetch');
const fs = require('fs');

const estimatesForMissingHospitalizationData = require('./data/estimates_for_missing_hospitalization_data.json');

// Do not remove this import! We want to load paramConfig.json at build time so that if somebody
// has accidentally broken the JSON by manual editing, build process is halted.
const paramConfig = require('./src/paramConfig.json');

const lastMidnight = new Date().setUTCHours(0,0,0,0);

function write(relativePath, content) {
    fs.writeFile(relativePath, content, function(err) {
        if(err) {
            console.log(err);
            process.exit(1); // Prevent build if disk write fails
        }
    }); 
}

async function callbackRtEstimate(response) {
    response.text()
    .then((text) => {
        const splitted = text.split(/\r?\n/)
        const lastLine = splitted[splitted.length-2]
        const lastRtEstimateValue = Number.parseFloat(lastLine.split(',')[1])
        const lastRtEstimateDate = lastLine.split(',')[0]
        console.log('Last Rt estimate:', lastRtEstimateValue, lastRtEstimateDate)
        if (lastRtEstimateValue > 0 && lastRtEstimateValue < 10) {
            write(
                'data/latest_Rt.csv',
                `date,Rt\n${lastRtEstimateDate},${lastRtEstimateValue}`
            )
        } else {
            process.exit(1); // Prevent build if estimate out of bounds.
        }
    })
    .catch(error => {
        console.log(error)
        process.exit(1); // Prevent build if parse fails
    });
}

async function callbackRtPNG(response) {
    response.buffer()
    .then((blob) => {
        write('public/latest_Rt.png', blob)
    })
    .catch(error => {
        console.log(error)
        process.exit(1); // Prevent build if parse fails
    });
}

async function callbackHSConfirmedCasesAndDeaths(response) {
    response.json()
    .then((json) => {

        // Keep the original JSON for debugging purposes.
        write("data/hs_raw_cases_and_deaths.json", JSON.stringify(json))
        
        const confirmedCases = json['confirmed'].slice(1) // Epidemic started from the second confirmed case, not the first, which occurred 1 month earlier.
        const deaths = json['deaths']
        const epidemyStartDate = new Date(Date.parse(confirmedCases[0]["date"])).setUTCHours(0,0,0,0)
        function daysFromZero(dateTime) {
            return Math.round((new Date(dateTime).getTime() - new Date(epidemyStartDate).getTime()) / 86400000);
        }
        const days = daysFromZero(lastMidnight)

        // Initialize parsed
        var parsed = { }
        parsed['epidemyStartDate'] = epidemyStartDate
        parsed['days'] = days
        const thingsToCount = ["newConfirmedCases", "cumulativeConfirmedCases", "newConfirmedDeaths", "cumulativeConfirmedDeaths", "activeHospitalizations", "activeICU"]
        for (var i=0; i<thingsToCount.length; i++) {
            const thing = thingsToCount[i]
            parsed[thing] = {}
            for (var day=0; day<days; day++) {
                parsed[thing][day] = 0
            }
        }

        // Count confirmed cases per day, and index them according to "days from day 0"
        for (var i=0; i<confirmedCases.length; i++) {
            const c = confirmedCases[i]
            const dateTime = new Date(Date.parse(c["date"])).setUTCHours(0,0,0,0);
            if (dateTime < lastMidnight) {
                // Exclude today's data by assumption that it is missing entries.
                const day = daysFromZero(dateTime)
                parsed["newConfirmedCases"][day]++
            }
        }

        // Count deaths per day, and index them according to "days from day 0"
        for (var i=0; i<deaths.length; i++) {
            const c = deaths[i]
            const dateTime = new Date(Date.parse(c["date"])).setUTCHours(0,0,0,0);
            if (dateTime < lastMidnight) {
                // Exclude today's data by assumption that it is missing entries.
                const day = daysFromZero(dateTime)
                parsed["newConfirmedDeaths"][day]++
            }
        }

        // Count cumulative from new
        for (var day=0; day<days; day++) {
            parsed["cumulativeConfirmedCases"][day] = parsed["newConfirmedCases"][day]
            parsed["cumulativeConfirmedDeaths"][day] = parsed["newConfirmedDeaths"][day]
            if (day > 0) {
                parsed["cumulativeConfirmedCases"][day] += parsed["cumulativeConfirmedCases"][day-1]
                parsed["cumulativeConfirmedDeaths"][day] += parsed["cumulativeConfirmedDeaths"][day-1]
            }
        }

        fetchOrExit("https://w3qa5ydb4l.execute-api.eu-west-1.amazonaws.com/prod/finnishCoronaHospitalData", callbackHSHospitalizations, parsed)
    })
}

async function callbackHSHospitalizations(response, parsed) {
    response.json()
    .then((json) => {

        // Keep the original JSON for debugging purposes.
        write("data/hs_raw_hospitalizations.json", JSON.stringify(json))

        const hosp = json['hospitalised'].filter(entry => {
            return entry['area'] === 'Finland'
        })
        
        function daysFromZero(dateTime) {
            return Math.round((new Date(dateTime).getTime() - new Date(parsed['epidemyStartDate']).getTime()) / 86400000);
        }

        for (var i=0; i<hosp.length; i++) {
            const c = hosp[i]
            const dateTime = new Date(Date.parse(c["date"])).setUTCHours(0,0,0,0);
            if (dateTime < lastMidnight) {
                // Exclude today's data by assumption that it is missing entries.
                const day = daysFromZero(dateTime)
                parsed["activeHospitalizations"][day] = c['inWard']
                parsed["activeICU"][day] = c['inIcu']
            }
        }
    
        // Finnish hospitalization data is missing entries for early days. Use estimates for those days.
        const est = estimatesForMissingHospitalizationData['hospitalised']
        for (var i=0; i<est.length; i++) {
            const c = est[i]
            const dateTime = new Date(Date.parse(c["date"])).setUTCHours(0,0,0,0);
            const day = daysFromZero(dateTime)
            if (parsed["activeHospitalizations"][day] === 0) {
                parsed["activeHospitalizations"][day] = c['inWard']
                parsed["activeICU"][day] = c['inIcu']
            }
        }
        
        write("data/hs_parsed.json", JSON.stringify(parsed))
    })
}

async function fetchOrExit(url, callback, additionalDataForCallback) {
    return await fetch(url)
    .then((response) => {
        if (!response.ok) {
            console.log(response)
            process.exit(1); // Prevent build if fetch fails
        }
        return response
    })
    .then(function(response) {
        return callback(response, additionalDataForCallback)
    })
    .catch(error => {
        console.log(error)
        process.exit(1); // Prevent build if parse fails
    });
}

function fetchRtEstimateData() {
    fetchOrExit("https://coronastoragemyvs.blob.core.windows.net/estimate-rt/latest_Rt.csv", callbackRtEstimate)
    fetchOrExit("https://coronastoragemyvs.blob.core.windows.net/estimate-rt/latest_Rt.png", callbackRtPNG)
}

function fetchHSData() {
    fetchOrExit("https://w3qa5ydb4l.execute-api.eu-west-1.amazonaws.com/prod/finnishCoronaData/v2", callbackHSConfirmedCasesAndDeaths)
    // Please see the callback function; it initiates a second fetch to a different file.
}

fetchRtEstimateData()
fetchHSData()
