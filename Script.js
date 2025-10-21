import axios from "axios";
import moment from "moment";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const content = JSON.parse(fs.readFileSync("./content.json", "utf8"));
if (!config) {
  console.error("config.json not found, please run generatecontent.bat first");
  process.exit(1);
}
if (!content) {
  console.error("content.json not found, please run generatecontent.bat first");
  process.exit(1);
}
if (!content.cookie || content.cookie.trim() === "") {
  console.error("Please fill in the cookie in content.json");
  process.exit(1);
}
if (content.activateCutiBersama === undefined) {
  content.activateCutiBersama = false;
}
if (!content.defaultClockIn || content.defaultClockIn.trim() === "" || content.defaultClockIn === "xx:xx am") {
  console.error("Please fill in the clock in in content.json");
  process.exit(1);
}
if (!content.defaultClockOut || content.defaultClockOut.trim() === "" || content.defaultClockOut === "xx:xx pm") {
  console.error("Please fill in the clock in out content.json");
  process.exit(1);
}
if (!content.content || !Array.isArray(content.content) || content.content.length === 0) {
  console.error("Please fill in the content in content.json");
  process.exit(1);
}
if (content.content.find((c) => !c.date || c.date.trim() === "" || !c.activity || c.activity.trim() === "" || !c.description || c.description.trim() === "")) {
  console.error("Please fill in the content in content.json");
  process.exit(1);
}

const cookie = content.cookie.trim();
const activateCutiBersama = content.activateCutiBersama;
const clockIn = content.defaultClockIn;
const clockOut = content.defaultClockOut;

const getHeaderLogbookMonthId = () => {
  return {
    "Cookie": cookie,
  };
};

const getPostHeaderLogbook = () => {
  return {
    "Cookie": cookie,
    "Content-Type": "application/x-www-form-urlencoded",
  };
};

async function getAxios(url, headers) {
  return new Promise((resolve, reject) => {
    axios
      .get(url, {
        headers: headers,
      })
      .then((response) => {
        resolve(response.data);
      })
      .catch((error) => {
        console.log(error);
        process.exit(1);
      });
  });
}

async function postAxios(url, data, headers) {
  return new Promise((resolve, reject) => {
    axios
      .post(url, data, {
        headers: headers,
      })
      .then((response) => {
        resolve(response.data);
      })
      .catch((error) => {
        console.log(error);
        process.exit(1);
      });
  });
}

function getSaturdays(year, month) {
  const saturdays = [];
  let day = new Date(Date.UTC(year, month - 1, 1));

  while (day.getUTCMonth() === month - 1) {
    if (day.getUTCDay() === 6) {
      // Saturday (UTC)
      saturdays.push(new Date(day));
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }

  return saturdays;
}

function getDaysInMonth(isoDate) {
  return moment(isoDate.split("-").slice(0, 2).join("-")).daysInMonth();
}

function getMonthByNumber(num) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  return months[num - 1];
}

function getTemplateContentLog() {
  return {
    "model[ID]": "00000000-0000-0000-0000-000000000000",
    "model[LogBookHeaderID]": "",
    "model[Date]": "",
    "model[Activity]": "",
    "model[ClockIn]": `${clockIn}`,
    "model[ClockOut]": `${clockOut}`,
    "model[Description]": "",
    "model[flagjulyactive]": false,
  };
}

function getTemplateContentOffLog() {
  return {
    "model[ID]": "00000000-0000-0000-0000-000000000000",
    "model[LogBookHeaderID]": "",
    "model[Date]": "",
    "model[Activity]": "OFF",
    "model[ClockIn]": "OFF",
    "model[ClockOut]": "OFF",
    "model[Description]": "OFF",
    "model[flagjulyactive]": false,
  };
}

function getCurrentMonthDayoffs(currentMonth, dayoffs) {
  return dayoffs
    .map((dayoff) => {
      let [year, month, date] = dayoff.tanggal.split("-");
      [year, month, date] = [Number(year), Number(month), Number(date)];
      if (month === currentMonth) {
        const isCutiBersama = dayoff.is_cuti;
        if (isCutiBersama && !activateCutiBersama) {
          return null;
        }
        return new Date(Date.UTC(year, month - 1, date));
      }
      return null;
    })
    .filter((dayoff) => dayoff !== null && dayoff !== undefined);
}

function updateSaturdayDayOff(currentYear, currentMonth, currentLogbookMonthId) {
  let saturdays = getSaturdays(currentYear, currentMonth);
  saturdays.forEach((saturday, index) => {
    let contentLog = getTemplateContentOffLog();
    contentLog["model[LogBookHeaderID]"] = currentLogbookMonthId;
    contentLog["model[Date]"] = normalizeDateToAttribute(saturday.toISOString());

    postAxios("https://activity-enrichment.apps.binus.ac.id/LogBook/StudentSave",
      contentLog,
      getPostHeaderLogbook()
    );
    console.log(`${((index + 1) * 100) / saturdays.length}% | ${saturday.toISOString().split("T")[0]} (OFF)`
    );
  });
}

function normalizeDateToAttribute(isoDate) {
  return isoDate.replace(".000Z", "").toString();
}

async function main() {
  console.log("Fetching logbook months...");
  const logbookMonths = await getAxios(
    "https://activity-enrichment.apps.binus.ac.id/LogBook/GetMonths",
    getHeaderLogbookMonthId()
  );
  
  const now = new Date(Date.UTC(config.targetYear, config.targetMonth - 1)) || new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  const currentLogbookMonth = logbookMonths.data.find((logbookMonth) => logbookMonth.month === getMonthByNumber(currentMonth));
  const currentLogbookMonthId = currentLogbookMonth.logBookHeaderID.trim();
  console.log("Logbook ID:", currentLogbookMonthId);
  
  let totalDayInCurrentMonth = getDaysInMonth(now.toISOString());
  
  
  // console.log(saturdays.map((d) => d.toISOString()));
  // console.log(totalDayInCurrentMonth);

  console.log("Fetching day off...");
  const dayoffs = await getAxios(
    `https://dayoffapi.vercel.app/api?year=${currentYear}`,
    getHeaderLogbookMonthId
  );
  const currentMonthDayoffs = getCurrentMonthDayoffs(currentMonth, dayoffs);
  
  console.log("Calculating days excluding holidays...");
  let daysExcludeHoliday = [];
  for (let i = 1; i <= totalDayInCurrentMonth; i++) {
    const date = new Date(Date.UTC(currentYear, currentMonth - 1, i));
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      if (!currentMonthDayoffs.find((dayoff) => dayoff.toISOString() === date.toISOString())) {
        daysExcludeHoliday.push(date);
      }
    }
  }

  console.log("Update log off...");
  updateSaturdayDayOff(currentYear, currentMonth, currentLogbookMonthId);

  console.log("Update active log...");
  daysExcludeHoliday.forEach((day, index) => {
    let contentLog = getTemplateContentLog();
    contentLog["model[LogBookHeaderID]"] = currentLogbookMonthId;
    contentLog["model[Date]"] = normalizeDateToAttribute(day.toISOString());
    contentLog["model[Activity]"] = (content.content.find((c) => c.date === day.toISOString().split("T")[0]) || { activity: "" }).activity;
    contentLog["model[Description]"] = (content.content.find((c) => c.date === day.toISOString().split("T")[0]) || { description: "" }).description;

    // console.log(contentLog);
    postAxios("https://activity-enrichment.apps.binus.ac.id/LogBook/StudentSave",
      contentLog,
      getPostHeaderLogbook()
    );
    console.log(
      `${(((index + 1) * 100) / daysExcludeHoliday.length).toFixed(2)}% | ${
        day.toISOString().split("T")[0]
      } (Active)`
    );
  });

  console.log("Create Backup JSON...");
  const jakartaTime = new Date()
    .toLocaleString("en-CA", {
      timeZone: "Asia/Jakarta",
      hour12: false,
    })
    .replace(",", "")
    .replace(/:/g, "-")
    .replace(/ /g, "_");
  const jsonContent = JSON.stringify(content, null, 2);
  fs.writeFileSync("content-backup-" + jakartaTime + ".json", jsonContent, "utf8");

  console.log("All done!");
}
main();
