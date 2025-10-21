import fs from "fs";
import moment from "moment";
import axios from "axios";

const configFile = JSON.parse(fs.readFileSync("./config.json", "utf8"));

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
        reject(error);
      });
  });
}

function getDaysInMonth(isoDate) {
  return moment(isoDate.split("-").slice(0, 2).join("-")).daysInMonth();
}

function getCurrentMonthDayoffs(currentMonth, dayoffs) {
  return dayoffs
    .map((dayoff) => {
      let [year, month, date] = dayoff.tanggal.split("-");
      [year, month, date] = [Number(year), Number(month), Number(date)];
      if (month === currentMonth) {
        const isCutiBersama = dayoff.is_cuti;
        if (isCutiBersama && !configFile.activateCutiBersama) {
          return null;
        }
        return new Date(Date.UTC(year, month - 1, date));
      }
      return null;
    })
    .filter((dayoff) => dayoff !== null && dayoff !== undefined);
}

async function main() {
    const now = new Date(Date.UTC(configFile.targetYear, configFile.targetMonth - 1)) || new Date();
    const currentMonth = now.getUTCMonth() + 1;
    const currentYear = now.getUTCFullYear();

    let totalDayInCurrentMonth = getDaysInMonth(now.toISOString());
    
    console.log("Fetching day off...");
    const dayoffs = await getAxios(
      `https://dayoffapi.vercel.app/api?year=${currentYear}`,
      {}
    );
    const currentMonthDayoffs = getCurrentMonthDayoffs(currentMonth, dayoffs);
    
    console.log("Calculating days excluding holidays...");
    let daysExcludeHoliday = [];
    for (let i = 1; i <= totalDayInCurrentMonth; i++) {
      const date = new Date(Date.UTC(currentYear, currentMonth - 1, i));
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
        if (
          !currentMonthDayoffs.find(
            (dayoff) => dayoff.toISOString() === date.toISOString()
          )
        ) {
          daysExcludeHoliday.push(date);
        }
      }
    }
    
    const contents = daysExcludeHoliday.map((day) => {
        return { activity: "", description: "", date: (day.toISOString().split("T")[0]) };
    });
    
    const config = {
        cookie: "",
        activateCutiBersama: configFile.activateCutiBersama || false,
        defaultClockIn: "xx:xx am",
        defaultClockOut: "xx:xx pm",
        content: contents,
    }
    
    const jsonConfig = JSON.stringify(config, null, 2);
    fs.writeFileSync("content.json", jsonConfig, "utf8");
    
    console.log("config.json generated!");
}
main();