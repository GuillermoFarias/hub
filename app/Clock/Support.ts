import { USHRT_MAX, COMMANDS } from './Constants';

export default class Support {

    /**
     * @param time number
     * @returns Date
     */
    public decodeTime(time: number): Date {
        const second = time % 60;
        time = (time - second) / 60;

        const minute = time % 60;
        time = (time - minute) / 60;

        const hour = time % 24;
        time = (time - hour) / 24;

        const day = (time % 31) + 1;
        time = (time - (day - 1)) / 31;

        const month = time % 12;
        time = (time - month) / 12;

        const year = time + 2000;

        return new Date(year, month, day, hour, minute, second);
    }

    /**
     * @param date
     * @returns number
     */
    public encode(date: Date): number {
        return (
            ((date.getFullYear() % 100) * 12 * 31 +
                date.getMonth() * 31 +
                date.getDate() -
                1) *
            (24 * 60 * 60) +
            (date.getHours() * 60 + date.getMinutes()) * 60 +
            date.getSeconds()
        );
    }

    /**
     * @param hex Buffer
     * @returns Date
     */
    public parseHexToTime(hex: Buffer): Date {
        const time = {
            year: hex.readUIntLE(0, 1),
            month: hex.readUIntLE(1, 1),
            date: hex.readUIntLE(2, 1),
            hour: hex.readUIntLE(3, 1),
            minute: hex.readUIntLE(4, 1),
            second: hex.readUIntLE(5, 1)
        }

        return new Date(2000 + time.year, time.month - 1, time.date, time.hour, time.minute, time.second)
    }

    /**
     * @param recordData Buffer
     * @returns object
     */
    public decodeRecordData16(recordData: Buffer): {} {
        return {
            deviceUserId: recordData.readUIntLE(0, 2),
            recordTime: this.parseTimeToDate(recordData.readUInt32LE(4))
        }
    }

    /**
     * @param commandValue number
     * @returns string
     */
    public exportErrorMessage(commandValue: number) {
        const keys = Object.keys(COMMANDS)
        for (let i = 0; i < keys.length; i++) {
            if (COMMANDS[keys[i]] === commandValue) {
                return keys[i].toString()
            }
        }

        return 'AN UNKNOWN ERROR'
    }

    public parseTimeToDate(time) {
        const second = time % 60;
        time = (time - second) / 60;
        const minute = time % 60;
        time = (time - minute) / 60;
        const hour = time % 24;
        time = (time - hour) / 24;
        const day = time % 31 + 1;
        time = (time - (day - 1)) / 31;
        const month = time % 12;
        time = (time - month) / 12;
        const year = time + 2000;

        return new Date(year, month, day, hour, minute, second);
    }

    public decodeUserData28(userData) {
        const user = {
            uid: userData.readUIntLE(0, 2),
            role: userData.readUIntLE(2, 1),
            name: userData
                .slice(8, 8 + 8)
                .toString('ascii')
                .split('\0')
                .shift(),
            userId: userData.readUIntLE(24, 4)
        };
        return user;
    }
}