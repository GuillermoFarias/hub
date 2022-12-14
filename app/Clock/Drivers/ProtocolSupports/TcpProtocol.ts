import { COMMANDS, MAX_CHUNK, REQUEST_DATA, USHRT_MAX } from "../../Constants";
import Protocol from "./Protocol";
import net from 'node:net';

export default class TcpProtocol extends Protocol {
    protected socket: net.Socket | null = null;

    public createSocket(cbError, cbClose) {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket()

            this.socket.once('error', err => {
                reject(err)
                cbError && cbError(err)
            })

            this.socket.once('connect', () => {
                resolve(this.socket)
            })

            this.socket.once('close', (err) => {
                this.socket = null;
                cbClose && cbClose('tcp');
                console.log('close', err)
            })

            if (this.timeout) {
                this.socket.setTimeout(this.timeout)
            }

            this.socket.connect(this.port, this.ip)
        })
    }

    /**
      * @param msg Buffer
      * @param connect boolean
      * @returns Promise<Buffer>
      */
    public writeMessage(msg: Buffer, connect: boolean): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let timer: NodeJS.Timeout

            this.socket?.once('data', (data) => {
                timer && clearTimeout(timer)
                resolve(data)
            });

            this.socket?.write(msg, undefined, async (err) => {
                if (err) {
                    reject(err)
                } else if (this.timeout) {
                    timer = await setTimeout(() => {
                        clearTimeout(timer)
                        reject(new Error('TIMEOUT_ON_WRITING_MESSAGE'))
                    }, connect ? 2000 : this.timeout)
                }
            });
        })
    }

    /**
      * @param command number
      * @param data string | Buffer
      * @returns Promise<Buffer>
      */
    public executeCmd(command: number, data: string | Buffer): Promise<Buffer> {
        return new Promise(async (resolve, reject) => {
            if (command === COMMANDS.CMD_CONNECT) {
                this.sessionId = 0
                this.replyId = 0
            } else {
                this.replyId++
            }
            const buf = this.createHeader(command, this.sessionId, this.replyId, data)
            let reply: Buffer | null = null

            try {
                reply = await this.writeMessage(buf, command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_EXIT)

                const rReply = this.removeHeader(reply);
                if (rReply && rReply.length && rReply.length >= 0) {
                    if (command === COMMANDS.CMD_CONNECT) {
                        this.sessionId = rReply.readUInt16LE(4);
                    }
                }
                resolve(rReply)
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
    protected createHeader(command: number, sessionId: number, replyId: number, data: string | Buffer): Buffer {
        const dataBuffer = Buffer.from(data);
        const buf = Buffer.alloc(8 + dataBuffer.length);

        buf.writeUInt16LE(command, 0);
        buf.writeUInt16LE(0, 2);

        buf.writeUInt16LE(sessionId, 4);
        buf.writeUInt16LE(replyId, 6);
        dataBuffer.copy(buf, 8);

        const chksum2 = this.createChkSum(buf);
        buf.writeUInt16LE(chksum2, 2);

        replyId = (replyId + 1) % USHRT_MAX;
        buf.writeUInt16LE(replyId, 6);

        const prefixBuf = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0x13, 0x00, 0x00, 0x00])

        prefixBuf.writeUInt16LE(buf.length, 4)

        return Buffer.concat([prefixBuf, buf]);
    }

    /**
      * @param msg Buffer
      * @returns Promise<Buffer>
      */
    protected requestData(msg: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let timer: NodeJS.Timeout | string | number | undefined = undefined;

            let replyBuffer = Buffer.from([])
            const internalCallback = (data) => {
                this.socket?.removeListener('data', handleOnData)
                timer && clearTimeout(timer)
                resolve(data)
            }

            const handleOnData = (data: Buffer) => {
                replyBuffer = Buffer.concat([replyBuffer, data]);

                if (this.checkNotEvent(data)) {
                    return
                };

                clearTimeout(timer)
                const header = this.decodeHeader(replyBuffer.subarray(0, 16));

                if (header.commandId === COMMANDS.CMD_DATA) {
                    timer = setTimeout(() => {
                        internalCallback(replyBuffer)
                    }, 1000)
                } else {
                    timer = setTimeout(() => {
                        reject(new Error('TIMEOUT_ON_RECEIVING_REQUEST_DATA'))
                    }, this.timeout)

                    const packetLength = data.readUIntLE(4, 2)
                    if (packetLength > 8) {
                        internalCallback(data)
                    }
                }
            }

            this.socket?.on('data', handleOnData)

            this.socket?.write(msg, undefined, err => {
                if (err) {
                    reject(err)
                }

                timer = setTimeout(() => {
                    reject(Error('TIMEOUT_IN_RECEIVING_RESPONSE_AFTER_REQUESTING_DATA'))
                }, this.timeout)

            })
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
            let reply: Buffer = Buffer.from([]);

            try {
                reply = await this.requestData(buf)
                console.log('reply', reply)
            } catch (err) {
                reject(err)
            }

            const header = this.decodeHeader(reply.subarray(0, 16))
            switch (header.commandId) {
                case COMMANDS.CMD_DATA: {
                    resolve({ data: reply.subarray(16), mode: 8 })
                    break;
                }
                case COMMANDS.CMD_ACK_OK:
                case COMMANDS.CMD_PREPARE_DATA: {
                    // this case show that data is prepared => send command to get these data 
                    // reply variable includes information about the size of following data
                    const recvData = reply.subarray(16)
                    const size = recvData.readUIntLE(1, 4)


                    // We need to split the data to many chunks to receive , because it's to large
                    // After receiving all chunk data , we concat it to TotalBuffer variable , that 's the data we want
                    let remain = size % MAX_CHUNK
                    let numberChunks = Math.round(size - remain) / MAX_CHUNK
                    let totalPackets = numberChunks + (remain > 0 ? 1 : 0)
                    let replyData = Buffer.from([])


                    let totalBuffer = Buffer.from([])
                    let realTotalBuffer = Buffer.from([])

                    const internalCallback = (replyData, err: Error | null = null) => {
                        // this.socket && this.socket.removeListener('data', handleOnData)
                        timer && clearTimeout(timer)
                        resolve({ data: replyData, err })
                    }

                    const timeout = 10000
                    let timer = setTimeout(() => {
                        internalCallback(replyData, new Error('TIMEOUT WHEN RECEIVING PACKET'))
                    }, timeout)

                    const handleOnData = (reply) => {

                        if (this.checkNotEvent(reply)) return;
                        clearTimeout(timer)
                        timer = setTimeout(() => {
                            internalCallback(replyData,
                                new Error(`TIME OUT !! ${totalPackets} PACKETS REMAIN !`))
                        }, timeout)

                        totalBuffer = Buffer.concat([totalBuffer, reply])
                        const packetLength = totalBuffer.readUIntLE(4, 2)
                        if (totalBuffer.length >= 8 + packetLength) {

                            realTotalBuffer = Buffer.concat([realTotalBuffer, totalBuffer.subarray(16, 8 + packetLength)])
                            totalBuffer = totalBuffer.subarray(8 + packetLength)

                            if ((totalPackets > 1 && realTotalBuffer.length === MAX_CHUNK + 8)
                                || (totalPackets === 1 && realTotalBuffer.length === remain + 8)) {

                                replyData = Buffer.concat([replyData, realTotalBuffer.subarray(8)])
                                totalBuffer = Buffer.from([])
                                realTotalBuffer = Buffer.from([])

                                totalPackets -= 1
                                cb && cb(replyData.length, size)

                                if (totalPackets <= 0) {
                                    internalCallback(replyData)
                                }
                            }
                        }
                    }

                    this.socket?.once('close', () => {
                        internalCallback(replyData, new Error('Socket is disconnected unexpectedly'))
                    })

                    this.socket?.on('data', handleOnData);

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

        this.socket?.write(buf, undefined, err => {
            if (err) {
                console.log(`[TCP][SEND_CHUNK_REQUEST]` + err.toString())
            }
        })
    }

    /**
      * @param data Buffer
      * @returns boolean
      */
    protected checkNotEvent(data: Buffer): boolean {
        try {
            data = this.removeHeader(data)
            const commandId = data.readUIntLE(0, 2)
            const event = data.readUIntLE(4, 2)
            return event === COMMANDS.EF_ATTLOG && commandId === COMMANDS.CMD_REG_EVENT
        } catch (err) {
            // log(`[228] : ${err.toString()} ,${data.toString('hex')} `)
            return false
        }
    }

    /**
      * @param header Buffer
      * @returns {commandId, checkSum, sessionId, replyId, payloadSize}
      */
    protected decodeHeader(header: Buffer): {
        commandId: number, checkSum: number, sessionId: number, replyId: number, payloadSize: number
    } {
        const recvData = header.subarray(8)
        const payloadSize = header.readUIntLE(4, 2)

        const commandId = recvData.readUIntLE(0, 2)
        const checkSum = recvData.readUIntLE(2, 2)
        const sessionId = recvData.readUIntLE(4, 2)
        const replyId = recvData.readUIntLE(6, 2)
        return { commandId, checkSum, sessionId, replyId, payloadSize }
    }

    /**
      * @param buf Buffer
      * @returns Buffer
      */
    private removeHeader(buf: Buffer): Buffer {
        if (buf.length < 8) {
            return buf;
        }

        if (buf.compare(Buffer.from([0x50, 0x50, 0x82, 0x7d]), 0, 4, 0, 4) !== 0) {
            return buf;
        }

        return buf.slice(8);
    }

    public decodeRecordRealTimeLog52(recordData: Buffer) {
        const payload = this.removeHeader(recordData)

        const recvData = payload.subarray(8)

        const userId = recvData.slice(0, 9)
            .toString('ascii')
            .split('\0')
            .shift()

        const attTime = this.parseHexToTime(recvData.subarray(26, 26 + 6))
        return { userId, attTime }
    }

    /**
      * @returns net.Socket | null
      */
    public getSocket(): net.Socket | null {
        return this.socket;
    }

    /**
      * @returns Promise<boolean>
      */
    public closeSocket(): Promise<boolean> {
        return new Promise((resolve) => {
            this.socket?.removeAllListeners('data')
            this.socket?.end(() => {
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

    public async getRealTimeLogs(cb: any = () => { }) {
        this.replyId++;

        const buf = this.createHeader(COMMANDS.CMD_REG_EVENT, this.sessionId, this.replyId, Buffer.from([0x01, 0x00, 0x00, 0x00]))

        this.socket?.write(buf, undefined, err => {
            console.log('err', err)
        })

        this.socket?.listenerCount('data') === 0 && this.socket.on('data', (data) => {

            if (!this.checkNotEvent(data)) return;
            if (data.length > 16) {
                cb(this.decodeRecordRealTimeLog52(data))
            }

        })
    }

    /**
     *  reject error when starting request data
     *  return { data: users, err: Error } when receiving requested data
     */
    public async getUsers(): Promise<{ data: {}[], err: Error }> {
        // Free Buffer Data to request Data
        if (this.socket) {
            try {
                await this.executeCmd(COMMANDS.CMD_FREE_DATA, '')
            } catch (err) {
                return Promise.reject(err)
            }
        }

        let data: any = null;
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


        const USER_PACKET_SIZE = 72

        let userData = data.data.subarray(4)

        let users = [{}]

        while (userData.length >= USER_PACKET_SIZE) {
            const user = this.decodeUserData72(userData.subarray(0, USER_PACKET_SIZE))
            users.push(user)
            userData = userData.subarray(USER_PACKET_SIZE)


        }

        return { data: users, err: data.err }
    }


    /**
     * @param {*} ip
     * @param {*} callbackInProcess
     *  reject error when starting request data
     *  return { data: records, err: Error } when receiving requested data
     */
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


        const RECORD_PACKET_SIZE = 40

        let recordData = data.data.subarray(4)
        let records = [{}]
        while (recordData.length >= RECORD_PACKET_SIZE) {
            const record = this.decodeRecordData40(recordData.subarray(0, RECORD_PACKET_SIZE))
            records.push({ ...record, ip: this.ip })
            recordData = recordData.subarray(RECORD_PACKET_SIZE)
        }

        return { data: records, err: data.err }

    }
}