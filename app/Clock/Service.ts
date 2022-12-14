import ZkTcpDriver from "./Drivers/ZkTcpDriver"
import ZkUdpDriver from "./Drivers/ZkUdpDriver"

const ERROR_TYPES = {
    ECONNRESET: 'ECONNRESET',
    ECONNREFUSED: 'ECONNREFUSED',
    EADDRINUSE: 'EADDRINUSE',
    ETIMEDOUT: 'ETIMEDOUT'
}

export default class Service {
    protected zklibTcp: ZkTcpDriver;
    protected zklibUdp: ZkUdpDriver;
    protected interval: any;
    protected timer: any;
    protected isBusy: boolean;
    protected ip: string;
    protected connectionType: string | null;

    constructor(ip, port, timeout, inport) {
        this.connectionType = null

        this.zklibTcp = new ZkTcpDriver(ip, port, timeout)
        this.zklibUdp = new ZkUdpDriver(ip, port, timeout, inport)
        this.interval = null
        this.timer = null
        this.isBusy = false
        this.ip = ip
    }

    private async functionWrapper(tcpCallback, udpCallback) {
        switch (this.connectionType) {
            case 'tcp':
                if (this.zklibTcp.getSocket()) {
                    try {
                        const res = await tcpCallback()
                        return res
                    } catch (err) {
                        return Promise.reject({
                            err: err,
                            type: `[TCP]`,
                            ip: this.ip
                        })
                    }

                } else {
                    return Promise.reject({
                        err: `Socket isn't connected !`,
                        type: `[TCP]`,
                        ip: this.ip
                    })
                }
            case 'udp':
                if (this.zklibUdp.getSocket()) {
                    try {
                        const res = await udpCallback()
                        return res
                    } catch (err) {
                        return Promise.reject({
                            err: err,
                            type: `[UDP]`,
                            ip: this.ip
                        })
                    }
                } else {
                    return Promise.reject({
                        err: `Socket isn't connected !`,
                        type: `[UDP]`,
                        ip: this.ip
                    })
                }
            default:
                return Promise.reject({
                    err: `Socket isn't connected !`,
                    type: '',
                    ip: this.ip
                })
        }
    }

    async createSocket(cbErr, cbClose) {
        try {
            if (!this.zklibTcp.getSocket()) {
                try {
                    await this.zklibTcp.createSocket(cbErr, cbClose)
                } catch (err) {
                    throw err;
                }

                try {
                    await this.zklibTcp.connect();
                    console.log('ok tcp')
                } catch (err) {
                    throw err;
                }
            }

            this.connectionType = 'tcp'

        } catch (err) {
            try {
                await this.zklibTcp.disconnect()
            } catch (err) { }

            if (err.code !== ERROR_TYPES.ECONNREFUSED) {
                return Promise.reject({ err: err, type: 'TCP CONNECT', ip: this.ip })
            }

            try {
                if (!this.zklibUdp.getSocket()) {
                    await this.zklibUdp.createSocket(cbErr, cbClose)
                    await this.zklibUdp.connect()
                }

                console.log('ok udp')
                this.connectionType = 'udp'
            } catch (err) {



                if (err.code !== 'EADDRINUSE') {
                    this.connectionType = null
                    try {
                        await this.zklibUdp.disconnect()
                    } catch (err) { }


                    return Promise.reject({ err: err, type: 'UDP CONNECT', ip: this.ip })
                } else {
                    this.connectionType = 'udp'

                }

            }
        }
    }

    async getUsers() {
        return await this.functionWrapper(
            () => this.zklibTcp.getUsers(),
            () => this.zklibUdp.getUsers()
        )
    }

    async getAttendances(cb) {
        return await this.functionWrapper(
            () => this.zklibTcp.getAttendances(cb),
            () => this.zklibUdp.getAttendances(cb),
        )
    }

    async getRealTimeLogs(cb) {
        return await this.functionWrapper(
            () => this.zklibTcp.getRealTimeLogs(cb),
            () => this.zklibUdp.getRealTimeLogs(cb)
        )
    }

    async disconnect() {
        return await this.functionWrapper(
            () => this.zklibTcp.disconnect(),
            () => this.zklibUdp.disconnect()
        )
    }

    async freeData() {
        return await this.functionWrapper(
            () => this.zklibTcp.freeData(),
            () => this.zklibUdp.freeData()
        )
    }

    async getTime() {
        return await this.functionWrapper(
            () => this.zklibTcp.getTime(),
            () => this.zklibUdp.getTime()
        );
    }

    async disableDevice() {
        return await this.functionWrapper(
            () => this.zklibTcp.disableDevice(),
            () => this.zklibUdp.disableDevice()
        )
    }


    async enableDevice() {
        return await this.functionWrapper(
            () => this.zklibTcp.enableDevice(),
            () => this.zklibUdp.enableDevice()
        )
    }


    async getInfo() {
        return await this.functionWrapper(
            () => this.zklibTcp.getInfo(),
            () => this.zklibUdp.getInfo()
        )
    }


    // async getSocketStatus() {
    //     return await this.functionWrapper(
    //         () => this.zklibTcp.getSocketStatus(),
    //         () => this.zklibUdp.getSocketStatus()
    //     )
    // }

    async clearAttendanceLog() {
        return await this.functionWrapper(
            () => this.zklibTcp.clearAttendanceLog(),
            () => this.zklibUdp.clearAttendanceLog()
        )
    }

    setIntervalSchedule(cb, timer) {
        this.interval = setInterval(cb, timer)
    }


    setTimerSchedule(cb, timer) {
        this.timer = setTimeout(cb, timer)
    }



}