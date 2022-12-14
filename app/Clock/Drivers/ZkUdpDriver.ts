import ZkDriver from './ZkDriver';
import UdpProtocol from './ProtocolSupports/UdpProtocol';
import { COMMANDS, REQUEST_DATA } from '../Constants';

export default class ZkUdpDriver extends ZkDriver {

  public constructor(ip: string, port: number, timeout: number, inport = 0) {
    super();
    this.protocol = new UdpProtocol(ip, port, timeout, inport);
  }

  public async freeData() {
    return await this.protocol.executeCmd(COMMANDS.CMD_FREE_DATA, '')
  }

  public async getTime() {
    const time = await this.protocol.executeCmd(COMMANDS.CMD_GET_TIME, '');
    return this.Support.decodeTime(time.readUInt32LE(8));
  }

  public async getInfo() {
    const data = await this.protocol.executeCmd(COMMANDS.CMD_GET_FREE_SIZES, '')
    try {
      return {
        userCounts: data.readUIntLE(24, 4),
        logCounts: data.readUIntLE(40, 4),
        logCapacity: data.readUIntLE(72, 4)
      }
    } catch (err) {
      return Promise.reject(err)
    }
  }

  public async clearAttendanceLog() {
    return await this.protocol.executeCmd(COMMANDS.CMD_CLEAR_ATTLOG, '')
  }

  public async disableDevice() {
    return await this.protocol.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE)
  }

  public async enableDevice() {
    return await this.protocol.executeCmd(COMMANDS.CMD_ENABLEDEVICE, '')
  }

  public async disconnect() {
    try {
      await this.protocol.executeCmd(COMMANDS.CMD_EXIT, '')
    } catch (err) {
    }
    return await this.protocol.closeSocket()
  }
}