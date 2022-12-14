import { COMMANDS, MAX_CHUNK, REQUEST_DATA, USHRT_MAX } from '../../Constants';
import Protocol from './Protocol';
import dgram from 'node:dgram';

export default class UdpProtocol extends Protocol {
    protected socket: dgram.Socket | null = null;

    public createSocket(cbError, cbClose) {
        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket('udp4');
            this.socket.setMaxListeners(Infinity)
            this.socket.once('error', err => {
                reject(err)
                cbError && cbError(err)
            })

            this.socket.on('close', (err) => {
                this.socket = null;
                cbClose && cbClose('udp');
                console.log('close', err);
            })

            this.socket.once('listening', () => {
                resolve(this.socket)
            })
            try {
                this.socket.bind(this.inport)
            } catch (err) {
            }

        })
    }

    /**
      * @param msg Buffer
      * @param connect boolean
      * @returns Promise<Buffer>
      */
    public writeMessage(msg: Buffer, connect: boolean): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let sendTimeoutId;
            this.socket?.once('message', (data) => {
                sendTimeoutId && clearTimeout(sendTimeoutId)
                resolve(data)
            })

            this.socket?.send(msg, 0, msg.length, this.port, this.ip, (err) => {
                if (err) {
                    reject(err)
                }
                if (this.timeout) {
                    sendTimeoutId = setTimeout(() => {
                        clearTimeout(sendTimeoutId)
                        reject(new Error('TIMEOUT_ON_WRITING_MESSAGE'))
                    }, connect ? 2000 : this.timeout)
                }
            })
        })
    }

    /**
      * @param command number
      * @param data string | Buffer
      * @returns Promise<Buffer>
      */
    public executeCmd(command: number, data: string | Buffer): Promise<Buffer> {
        return new Promise(async (resolve, reject) => {
            try {
                if (command === COMMANDS.CMD_CONNECT) {
                    this.sessionId = 0
                    this.replyId = 0
                } else {
                    this.replyId++
                }

                const buf = this.createHeader(command, this.sessionId, this.replyId, data)
                const reply = await this.writeMessage(buf, command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_EXIT)

                if (reply && reply.length && reply.length >= 0) {
                    if (command === COMMANDS.CMD_CONNECT) {
                        this.sessionId = reply.readUInt16LE(4);
                    }
                }
                resolve(reply)
            } catch (err) {
                reject(err)
            }
        })
    }

    /**
      * @param command number
      * @param sessionId number
      * @param replyId number
      * @param data string
      * @returns Buffer
      */
    protected createHeader(command: any, sessionId?: number, replyId?: number, data?: string | Buffer): Buffer | any {
        const dataBuffer = Buffer.from(data || '');
        const buf = Buffer.alloc(8 + dataBuffer.length);

        buf.writeUInt16LE(command, 0);
        buf.writeUInt16LE(0, 2);

        buf.writeUInt16LE(sessionId || 0, 4);
        buf.writeUInt16LE(replyId || 0, 6);
        dataBuffer.copy(buf, 8);

        const chksum2 = this.createChkSum(buf);
        buf.writeUInt16LE(chksum2, 2);

        replyId = ((replyId || 0) + 1) % USHRT_MAX;
        buf.writeUInt16LE(replyId, 6);

        return buf
    }

    /**
      * @param msg Buffer
      * @returns Promise<Buffer>
      */
    protected requestData(msg: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let sendTimeoutId
            const internalCallback = (data) => {
                sendTimeoutId && clearTimeout(sendTimeoutId)
                this.socket?.removeListener('message', handleOnData)
                resolve(data)
            }

            const handleOnData = (data) => {
                if (this.checkNotEvent(data)) return;
                clearTimeout(sendTimeoutId)
                sendTimeoutId = setTimeout(() => {
                    reject(new Error('TIMEOUT_ON_RECEIVING_REQUEST_DATA'))
                }, this.timeout)

                if (data.length >= 13) {
                    internalCallback(data)
                }

            }

            this.socket?.on('message', handleOnData)

            this.socket?.send(msg, 0, msg.length, this.port, this.ip, (err) => {
                if (err) {
                    reject(err)
                }
                sendTimeoutId = setTimeout(() => {
                    reject(Error('TIMEOUT_IN_RECEIVING_RESPONSE_AFTER_REQUESTING_DATA'))
                }, this.timeout)

            })
        })

    }

    /**
      * @param start number
      * @param size number
      * @returns void
      */
    protected sendChunkRequest(start: number, size: number): void {
        this.replyId++;
        const reqData = Buffer.alloc(8)
        reqData.writeUInt32LE(start, 0)
        reqData.writeUInt32LE(size, 4)
        const buf = this.createHeader(COMMANDS.CMD_DATA_RDY, this.sessionId, this.replyId, reqData)

        this.socket?.send(buf, 0, buf.length, this.port, this.ip, (err) => {
            if (err) {
                if (err) {
                    console.log(`[UDP][SEND_CHUNK_REQUEST]` + err.toString())
                }
            }
        })
    }

    /**
      *
      * @param {*} reqData - indicate the type of data that need to receive ( user or attLog)
      * @param {*} cb - callback is triggered when receiving packets
      *
      * readWithBuffer will reject error if it'wrong when starting request data
      * readWithBuffer will return { data: replyData , err: Error } when receiving requested data
      */
    protected readWithBuffer(reqData, cb: any = null): Promise<{}> {
        return new Promise(async (resolve, reject) => {
            this.replyId++;
            const buf = this.createHeader(COMMANDS.CMD_DATA_WRRQ, this.sessionId, this.replyId, reqData)
            let reply: any = null;

            try {
                reply = await this.requestData(buf)
            } catch (err) {
                reject(err)
            }

            const header = this.createHeader(reply.subarray(0, 8));

            switch (header.commandId) {
                case COMMANDS.CMD_DATA: {
                    resolve({ data: reply.subarray(8), mode: 8, err: null })
                    break;
                }
                case COMMANDS.CMD_ACK_OK:
                case COMMANDS.CMD_PREPARE_DATA: {
                    // this case show that data is prepared => send command to get these data 
                    // reply variable includes information about the size of following data 
                    const recvData = reply.subarray(8)
                    const size = recvData.readUIntLE(1, 4)

                    // We need to split the data to many chunks to receive , because it's to large
                    // After receiving all chunk data , we concat it to TotalBuffer variable , that 's the data we want
                    let remain = size % MAX_CHUNK
                    let numberChunks = Math.round(size - remain) / MAX_CHUNK

                    let totalBuffer = Buffer.from([])

                    const internalCallback = (replyData, err: Error | null = null) => {
                        this.socket?.removeListener('message', handleOnData)
                        timer && clearTimeout(timer)
                        if (err) {
                            resolve({ err, data: replyData })
                        } else {
                            resolve({ err: null, data: replyData })
                        }
                    }

                    const timeout = 3000
                    let timer = setTimeout(() => {
                        internalCallback(totalBuffer, new Error('TIMEOUT WHEN RECEIVING PACKET'))
                    }, timeout)

                    const handleOnData = (reply) => {
                        if (this.checkNotEvent(reply)) return;
                        clearTimeout(timer)
                        timer = setTimeout(() => {
                            internalCallback(totalBuffer,
                                new Error(`TIMEOUT !! ${(size - totalBuffer.length) / size} % REMAIN !  `))
                        }, timeout)
                        const header = this.createHeader(reply)

                        switch (header.commandId) {
                            case COMMANDS.CMD_PREPARE_DATA: {
                                break;
                            }
                            case COMMANDS.CMD_DATA: {
                                totalBuffer = Buffer.concat([totalBuffer, reply.subarray(8)])
                                cb && cb(totalBuffer.length, size)
                                break;
                            }
                            case COMMANDS.CMD_ACK_OK: {
                                if (totalBuffer.length === size) {
                                    internalCallback(totalBuffer)
                                }
                                break;
                            }
                            default: {
                                internalCallback([], new Error('ERROR_IN_UNHANDLE_CMD ' + this.exportErrorMessage(header.commandId)))
                            }
                        }
                    }

                    this.socket?.on('message', handleOnData);

                    for (let i = 0; i <= numberChunks; i++) {
                        if (i === numberChunks) {
                            this.sendChunkRequest(numberChunks * MAX_CHUNK, remain)
                        } else {
                            this.sendChunkRequest(i * MAX_CHUNK, MAX_CHUNK)
                        }
                    }

                    break;
                }
                default: {
                    reject(new Error('ERROR_IN_UNHANDLE_CMD ' + this.exportErrorMessage(header.commandId)))
                }
            }
        })
    }

    /**
     * @param data Buffer
     * @returns boolean
     */
    protected checkNotEvent(data: Buffer): boolean {
        const commandId = this.decodeHeader(data.subarray(0, 8)).commandId
        return commandId === COMMANDS.CMD_REG_EVENT
    }

    /**
     * @param header Buffer
     * @returns {commandId, checkSum, sessionId, replyId
     */
    protected decodeHeader(header: Buffer): {
        commandId: number, checkSum: number, sessionId: number, replyId: number
    } {
        const commandId = header.readUIntLE(0, 2)
        const checkSum = header.readUIntLE(2, 2)
        const sessionId = header.readUIntLE(4, 2)
        const replyId = header.readUIntLE(6, 2)
        return { commandId, checkSum, sessionId, replyId }
    }

    /**
      * @returns dgram.Socket | null
      */
    public getSocket(): dgram.Socket | null {
        return this.socket;
    }

    /**
     * @param cb
     */
    public async getRealTimeLogs(cb: any = () => { }): Promise<void> {
        this.replyId++;
        const buf = this.createHeader(COMMANDS.CMD_REG_EVENT, this.sessionId, this.replyId, REQUEST_DATA.GET_REAL_TIME_EVENT)

        this.socket?.send(buf, 0, buf.length, this.port, this.ip, (err: any) => {
            console.log(err)
        })

        this.socket?.listenerCount('message') || 0 < 2 && this.socket?.on('message', (data) => {
            if (!this.checkNotEvent(data)) {
                return;
            }
            if (data.length === 18) {
                cb(this.decodeRecordRealTimeLog18(data))
            }
        })
    }

    /**
      * @param recordData
      * @returns
      */
    private decodeRecordRealTimeLog18(recordData: Buffer): any {
        const userId = recordData.readUIntLE(8, 1)
        const attTime = this.parseHexToTime(recordData.subarray(12, 18))
        return { userId, attTime }
    }

    /**
     * @returns Promise<boolean>
     */
    public closeSocket(): Promise<boolean> {
        return new Promise((resolve) => {
            this.socket?.removeAllListeners('message')
            this.socket?.close(() => {
                clearTimeout(timer)
                resolve(true)
            })

            /**
               * When socket isn't connected so this.socket.end will never resolve
               * we use settimeout for handling this case
               */
            const timer = setTimeout(() => {
                resolve(true)
            }, 2000)
        })
    }

    public async getAttendances(callbackInProcess = () => { }) {
        if (this.socket) {
            try {
                await this.executeCmd(COMMANDS.CMD_FREE_DATA, '')
            } catch (err) {
                return Promise.reject(err)
            }
        }

        let data: any = null
        try {
            data = await this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS, callbackInProcess)
        } catch (err) {
            return Promise.reject(err)
        }

        if (this.socket) {
            try {
                await this.executeCmd(COMMANDS.CMD_FREE_DATA, '')
            } catch (err) {
                return Promise.reject(err)
            }
        }

        if (data.mode) {
            // Data too small to decode in a normal way  => we need a parameter to indicate this case 
            const RECORD_PACKET_SIZE = 8
            let recordData = data.data.subarray(4)

            let records = [{}]
            while (recordData.length >= RECORD_PACKET_SIZE) {
                const record = this.Support.decodeRecordData16(recordData.subarray(0, RECORD_PACKET_SIZE))
                records.push({ ...record, ip: this.ip })
                recordData = recordData.subarray(RECORD_PACKET_SIZE)
            }

            return { data: records, err: data.err }

        } else {
            const RECORD_PACKET_SIZE = 16
            let recordData = data.data.subarray(4)

            let records = [{}]
            while (recordData.length >= RECORD_PACKET_SIZE) {
                const record = this.Support.decodeRecordData16(recordData.subarray(0, RECORD_PACKET_SIZE))
                records.push({ ...record, ip: this.ip })
                recordData = recordData.subarray(RECORD_PACKET_SIZE)
            }

            return { data: records, err: data.err }
        }
    }

    public async getUsers(): Promise<{ data: {}[], err: Error }> {
        // Free Buffer Data to request Data
        if (this.socket) {
            try {
                await this.executeCmd(COMMANDS.CMD_FREE_DATA, '')
            } catch (err) {
                return Promise.reject(err)
            }
        }


        let data: any = null
        try {
            data = await this.readWithBuffer(REQUEST_DATA.GET_USERS)
        } catch (err) {
            return Promise.reject(err)
        }

        // Free Buffer Data after requesting data
        if (this.socket) {
            try {
                await this.executeCmd(COMMANDS.CMD_FREE_DATA, '')
            } catch (err) {
                return Promise.reject(err)
            }
        }

        const USER_PACKET_SIZE = 28
        let userData = data.data.subarray(4)
        let users = [{}]

        while (userData.length >= USER_PACKET_SIZE) {
            const user = this.Support.decodeUserData28(userData.subarray(0, USER_PACKET_SIZE))
            users.push(user)
            userData = userData.subarray(USER_PACKET_SIZE)
        }

        return { data: users, err: data.err }

    }

}