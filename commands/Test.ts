import { BaseCommand } from '@adonisjs/core/build/standalone'
import * as Ably from 'ably';
import ZKLib from 'node-zklib';

export default class Test extends BaseCommand {
  /**
   * Command name is used to run the command
   */
  public static commandName = 'test:test'

  /**
   * Command description is displayed in the "help" output
   */
  public static description = ''

  public static settings = {
    /**
     * Set the following value to true, if you want to load the application
     * before running the command. Don't forget to call `node ace generate:manifest` 
     * afterwards.
     */
    loadApp: false,

    /**
     * Set the following value to true, if you want this command to keep running until
     * you manually decide to exit the process. Don't forget to call 
     * `node ace generate:manifest` afterwards.
     */
    stayAlive: true,
  }

  public async run() {

    // const { default: zkService } = (await import('../app/Clock/Service'));

    // try {
    //   const service = new zkService('192.168.2.251', 4370, 5000, 4370);
    //   await service.createSocket();
    //   console.log(await service.getInfo());
    //   service.getAttendances((percent, total) => {
    //     console.log('percent', percent)
    //     console.log('total', total)
    //   });
    //   service.getRealTimeLogs((data) => {
    //     console.log(data)
    //   });
    //   console.log(await service.getTime());
    // } catch (e) {
    //   console.log(e);
    // }


    let zkInstance = new ZKLib('192.168.2.251', 4370, 10000, 4000);
    try {
      // Create socket to machine
      await zkInstance.createSocket()


      // Get general info like logCapacity, user counts, logs count
      // It's really useful to check the status of device
      console.log(await zkInstance.getInfo())
    } catch (e) {
      console.log(e)
      if (e.code === 'EADDRINUSE') {
      }
    }


    // // Get users in machine
    // const users = await zkInstance.getUsers()
    // console.log(users)


    // // Get all logs in the machine
    // // Currently, there is no filter to take data, it just takes all !!
    // const logs = await zkInstance.getAttendances()
    // console.log(logs)


    // const attendances = await zkInstance.getAttendances((percent, total) => {
    //   // this callbacks take params is the percent of data downloaded and total data need to download 
    //   console.log('percent', percent)
    //   console.log('total', total)
    // })

    // YOu can also read realtime log by getRealTimelogs function

    // console.log('check users', users)

    zkInstance.getRealTimeLogs((data) => {
      // do something when some checkin
      console.log(data)
    })

    // // log.log('test');

    // let options: Ably.Types.ClientOptions = { key: 'fbb6XA.COprlQ:mLH0HlwkKE9KrWKaB9n9rZd-scxnri8nHK1tK4a7Dzw' };
    // let client = new Ably.Realtime(options); /* inferred type Ably.Realtime */
    // let channel = client.channels.get('getting-started'); /* inferred type Ably.Types.RealtimeChannel */

    // client.connection.on('connected', function () {
    //   console.log('Connected to Ably in realtime');
    // });

    // channel.subscribe(function (message) {
    //   console.log('Received: ' + message);
    // });

    // this.logger.info('Hello world!')
  }
}
