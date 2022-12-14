import { COMMANDS } from '../Constants';
import Support from "../Support";
import Protocol from './ProtocolSupports/Protocol';

export default abstract class ZkDriver {

    protected Support: Support = new Support();
    protected protocol: Protocol;

    public async connect(): Promise<any> {
        return new Promise(async (resolve, reject) => {
            try {
                const reply = await this.protocol.executeCmd(COMMANDS.CMD_CONNECT, '')
                if (reply) {
                    resolve(true)
                } else {
                    reject(new Error('NO_REPLY_ON_CMD_CONNECT'))
                }
            } catch (err) {
                reject(err)
            }
        })
    }

    public async createSocket(cbErr, cbClose) {
        return await this.protocol.createSocket(cbErr, cbClose);
    }

    public abstract getTime();

    public abstract freeData();

    public abstract disableDevice();

    public abstract enableDevice();

    public abstract disconnect();

    public abstract getInfo();

    public abstract clearAttendanceLog();

    public async getRealTimeLogs(cb: any): Promise<void> {
        return await this.protocol.getRealTimeLogs(cb);
    }

    public async getUsers(): Promise<{ data: {}[], err: Error }> {
        return await this.protocol.getUsers();
    }

    public async getAttendances(callbackInProcess: () => {}) {
        return await this.protocol.getAttendances(callbackInProcess);
    }

    public getSocket() {
        return this.protocol.getSocket();
    }
}