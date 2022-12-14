import { COMMANDS, USHRT_MAX } from 'App/Clock/Constants';
import Support from 'App/Clock/Support';
import dgram from 'node:dgram';
import net from 'node:net';

export default abstract class Protocol {
    protected ip: string = '';
    protected port: number = 0;
    protected timeout: number = 0;
    protected sessionId: any = null;
    protected replyId: number = 0;
    protected inport: number = 0;
    protected socket: dgram.Socket | net.Socket | null;
    protected Support: Support = new Support();

    public constructor(ip: string, port: number, timeout: number, inport: number = 0) {
        this.ip = ip;
        this.port = port;
        this.timeout = timeout;
        this.sessionId = null;
        this.replyId = 0;
        this.inport = inport;
    }

    public abstract createSocket(cbError, cbClose);

    /**
     * @param msg Buffer
     * @param connect boolean
     */
    public abstract writeMessage(msg: Buffer, connect: boolean): Promise<Buffer>;

    /**
     * @param command number
     * @param data string | Buffer
     */
    public abstract executeCmd(command: number, data: string | Buffer): Promise<Buffer>;

    /**
     * @param command number
     * @param sessionId number
     * @param replyId number
     * @param data string
     * @returns Buffer
     */
    protected abstract createHeader(command: number, sessionId: number, replyId: number, data: string | Buffer): Buffer;

    /**
      * @param msg Buffer
      * @returns Promise<Buffer>
      */
    protected abstract requestData(msg: Buffer): Promise<Buffer>;

    /**
      * @param data Buffer
      * @returns boolean
      */
    protected abstract checkNotEvent(data: Buffer): boolean;

    /**
      * @param header Buffer
      * @returns {}
      */
    protected abstract decodeHeader(header: Buffer): {};

    /**
      * @param start number
      * @param size number
      * @returns void
      */
    protected abstract sendChunkRequest(start: number, size: number): void;

    /**
      *
      * @param {*} reqData - indicate the type of data that need to receive ( user or attLog)
      * @param {*} cb - callback is triggered when receiving packets
      *
      * readWithBuffer will reject error if it'wrong when starting request data
      * readWithBuffer will return { data: replyData , err: Error } when receiving requested data
      */
    protected abstract readWithBuffer(reqData, cb: any): Promise<{}>;

    /**
     * @param cb
     */
    public abstract getRealTimeLogs(cb: any): Promise<void>;

    public abstract getUsers(): Promise<{ data: {}[], err: Error }>;

    public abstract getAttendances(callbackInProcess: () => {});

    /**
      * @param buf Buffer
      * @returns number
      */
    protected createChkSum(buf: Buffer): number {
        let chksum = 0;
        for (let i = 0; i < buf.length; i += 2) {
            if (i == buf.length - 1) {
                chksum += buf[i];
            } else {
                chksum += buf.readUInt16LE(i);
            }
            chksum %= USHRT_MAX;
        }
        chksum = USHRT_MAX - chksum - 1;

        return chksum;
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
      * @returns dgram.Socket | net.Socket | null
      */
    public getSocket(): dgram.Socket | net.Socket | null {
        return this.socket;
    }

    /**
      * @returns Promise<boolean>
      */
    public abstract closeSocket(): Promise<boolean>;


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

    /**
     * @param userData Buffer
     * @returns object
     */
    public decodeUserData72(userData: Buffer): {} {
        return {
            uid: userData.readUIntLE(0, 2),
            role: userData.readUIntLE(2, 1),
            password: userData
                .subarray(3, 3 + 8)
                .toString('ascii')
                .split('\0')
                .shift(),
            name: userData
                .slice(11)
                .toString('ascii')
                .split('\0')
                .shift(),
            cardno: userData.readUIntLE(35, 4),
            userId: userData
                .slice(48, 48 + 9)
                .toString('ascii')
                .split('\0')
                .shift(),
        };
    }

    /**
      * @param recordData Buffer
      * @returns object
      */
    public decodeRecordData40(recordData: Buffer): {} {
        return {
            userSn: recordData.readUIntLE(0, 2),
            deviceUserId: recordData
                .slice(2, 2 + 9)
                .toString('ascii')
                .split('\0')
                .shift(),
            recordTime: this.Support.parseTimeToDate(recordData.readUInt32LE(27)),
        }
    }
}