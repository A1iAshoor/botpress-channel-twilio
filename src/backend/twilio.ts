import axios, { AxiosInstance } from 'axios'
import * as sdk from 'botpress/sdk'
import crypto from 'crypto'
import { json as expressJson, Router } from 'express'
import _ from 'lodash'
import twilio from 'twilio'

import { Config } from '../config'

const debug = DEBUG('channel-twilio')
const debugMessages = debug.sub('messages')
const debugHttp = debug.sub('http')
const debugWebhook = debugHttp.sub('webhook')
const debugHttpOut = debugHttp.sub('out')

// const outgoingTypes = ['text', 'typing', 'login_prompt', 'carousel']
// type TwilioAction = 'typing_on' | 'typing_off' | 'mark_seen'

type MountedBot = { fromNumber: string; botId: string; client: TwilioClient }

export class TwilioService {
  private mountedBots: MountedBot[] = []
  private router: Router & sdk.http.RouterExtension
  private authToken: string
  private accountSID: string

  constructor(private bp: typeof sdk) {}

  async initialize() {
    const config = (await this.bp.config.getModuleConfig('channel-twilio')) as Config

    // if (!config.authToken || !config.authToken.length) {
    //   throw new Error('You need to set a non-empty value for "authToken" in data/global/config/channel-twilio.json')
    // }

    // if (!config.accountSID || !config.accountSID.length) {
    //   throw new Error(`You need to set a non-empty value for "accountSID" in data/global/config/channel-twilio.json`)
    // }

    // this.authToken = config.authToken
    // this.accountSID = config.accountSID

    this.router = this.bp.http.createRouterForBot('channel-twilio', {
      checkAuthentication: false,
      enableJsonBodyParser: false // we use our custom json body parser instead, see below
    })

    // tslint:disable-next-line: no-floating-promises
    this.router.getPublicPath().then(publicPath => {
      if (publicPath.indexOf('https://') !== 0) {
        this.bp.logger.warn('Twilio requires HTTPS to be setup to work properly. See EXTERNAL_URL botpress config.')
      }

      this.bp.logger.info(`Twilio Webhook URL is ${publicPath.replace('BOT_ID', '___')}/webhook`)
    })

    // this.router.get('/webhook', this._setupWebhook.bind(this))
    this.router.post('/webhook', this._handleIncomingMessage.bind(this))

    this.bp.events.registerMiddleware({
      description: 'Sends outgoing messages for the twilio channel',
      direction: 'outgoing',
      handler: this._handleOutgoingEvent.bind(this),
      name: 'twilio.sendMessages',
      order: 200
    })
  }

  async mountBot(botId: string) {
    const config = (await this.bp.config.getModuleConfigForBot('channel-twilio', botId)) as Config
    if (config.enabled) {
      if (!config.authToken) {
        return this.bp.logger
          .forBot(botId)
          .error('You need to configure an Access Token to enable it. Twilio Channel is disabled for this bot.')
      }
      const client = new TwilioClient(botId, this.bp)
      this.mountedBots.push({ fromNumber: config.fromNumber, botId: botId, client })
    }
  }

  async unmountBot(botId: string) {
    this.mountedBots = _.remove(this.mountedBots, x => x.botId === botId)
  }

  getTwilioClientByBotId(botId: string): TwilioClient {
    const entry = _.find(this.mountedBots, x => x.botId === botId)

    if (!entry) {
      throw new Error(`Can't find a TwilioClient for bot "${botId}"`)
    }

    return entry.client
  }

  private async _handleIncomingMessage(req, res) {
    const body = req.body

    this.bp.logger.info('body: ', body)

    res.status(200).send('EVENT_RECEIVED')

    const fromNumber = body.To.replace('whatsapp:', '')
    const toNumber = body.From.replace('whatsapp:', '')

    const bot = _.find<MountedBot>(this.mountedBots, { fromNumber })

    if (!bot) {
      debugMessages('could not find a bot for from number =', fromNumber)
      return
    }

    // if (!message) {
    //   debugMessages('incoming event without messaging entry')
    //   return
    // }

    if (undefined != body.Latitude) {
      this.bp.logger.info('location')
      await this._sendEvent(bot.botId, toNumber, { text: body.Latitude + ',' + body.Longitude }, { type: 'location' })
    } else if ('' != body.Body) {
      this.bp.logger.info('message')
      await this._sendEvent(bot.botId, toNumber, { text: body.Body }, { type: 'message' })
    }

    // await this._sendEvent(bot.botId, toNumber, body, { type: 'message' })
  }

  private async _sendEvent(botId: string, senderId: string, message, args: { type: string }) {
    await this.bp.events.sendEvent(
      this.bp.IO.Event({
        botId,
        channel: 'twilio',
        direction: 'incoming',
        payload: message,
        preview: message.text,
        target: senderId,
        ...args
      })
    )
  }

  // private async _setupWebhook(req, res) {
  //   this.bp.logger.info('req: ', req)
  //   this.bp.logger.info('res: ', res)

  //   const mode = req.query['hub.mode']
  //   const token = req.query['hub.authToken']
  //   const challenge = req.query['hub.challenge']

  //   const config = (await this.bp.config.getModuleConfig('channel-twilio')) as Config

  //   if (mode && token && mode === 'subscribe') {
  //     this.bp.logger.debug('Webhook Verified')
  //     res.status(200).send(challenge)
  //   } else {
  //     res.sendStatus(403)
  //   }
  // }

  private async _handleOutgoingEvent(event: sdk.IO.Event, next: sdk.IO.MiddlewareNextCallback) {
    // this.bp.logger.info('event: ', event.type)
    this.bp.logger.info('event.type: ', event.type)
    this.bp.logger.info('event.payload: ', event.payload)

    if (event.channel !== 'twilio') {
      return next()
    }

    const messageType = event.type === 'default' ? 'text' : event.type
    const twilio = this.getTwilioClientByBotId(event.botId)

    // if (!_.includes(outgoingTypes, messageType)) {
    //   return next(new Error('Unsupported event type: ' + event.type))
    // }

    if (messageType === 'text' || messageType === 'carousel') {
      await twilio.sendTextMessage(event.target, event.payload.text)

      if (undefined != event.payload.quick_replies) {
        const quick_replies = event.payload.quick_replies
        let str = ''
        let count = 1

        for (const reply of quick_replies) {
          // %0a
          str += '\n' + count + '- ' + reply.title
          count++
        }

        await twilio.sendTextMessage(event.target, str)
      }
    } else if (messageType === 'location') {
      // TODO We don't support sending files, location requests (and probably more) yet
      // throw new Error(`Message type "${messageType}" not implemented yet`)
      this.bp.logger.info('event.type: ', event.type)
      this.bp.logger.info('event.payload.text: ', event.payload.text)
      this.bp.logger.info('event.payload.location: ', event.payload.location)

      await twilio.sendTextMessage(event.target, event.payload.text, [event.payload.location])
    }

    next(undefined, false)
  }
}

export class TwilioClient {
  private config: Config

  constructor(private botId: string, private bp: typeof sdk) {}

  async getConfig(): Promise<Config> {
    if (this.config) {
      return this.config
    }

    const config = (await this.bp.config.getModuleConfigForBot('channel-twilio', this.botId)) as Config
    if (!config) {
      throw new Error(`Could not find channel-twilio.json config file for ${this.botId}.`)
    }

    return config
  }

  // async setupGetStarted(): Promise<void> {
  //   const config = await this.getConfig()
  //   if (!config.getStarted) {
  //     return
  //   }

  //   await this.sendProfile({
  //     get_started: {
  //       payload: config.getStarted
  //     }
  //   })
  // }

  // async setupGreeting(): Promise<void> {
  //   const config = await this.getConfig()
  //   if (!config.greeting) {
  //     await this.deleteProfileFields(['greeting'])
  //     return
  //   }

  //   await this.sendProfile({
  //     greeting: [
  //       {
  //         locale: 'default',
  //         text: config.greeting
  //       }
  //     ]
  //   })
  // }

  // async setupPersistentMenu(): Promise<void> {
  //   const config = await this.getConfig()
  //   if (!config.persistentMenu || !config.persistentMenu.length) {
  //     await this.deleteProfileFields(['persistent_menu'])
  //     return
  //   }

  //   await this.sendProfile({ persistent_menu: config.persistentMenu })
  // }

  // async sendAction(senderId: string, action: TwilioAction) {
  //   const body = {
  //     recipient: {
  //       id: senderId
  //     },
  //     sender_action: action
  //   }
  //   debugMessages('outgoing action', { senderId, action, body })
  //   await this._callEndpoint('/messages', body)
  // }

  async sendTextMessage(senderId: string, message: string, action?: string | string[]) {
    const config = await this.getConfig()

    this.bp.logger.info('accountSID: ', config.accountSID)
    this.bp.logger.info('authToken: ', config.authToken)
    this.bp.logger.info('senderId: ', senderId)
    this.bp.logger.info('config.fromNumber: ', config.fromNumber)

    const client = twilio(config.accountSID, config.authToken)

    await client.messages
      .create({
        from: 'whatsapp:' + config.fromNumber,
        body: message,
        persistentAction: action,
        to: 'whatsapp:' + senderId
      })
      // .then(message => this.bp.logger.info('message: ', message))
      .catch(error => this.bp.logger.info('error: ', error))

    debugMessages('outgoing text message', { senderId, message })
    // await this._callEndpoint('/messages', body)
  }

  // async deleteProfileFields(fields: string[]) {
  //   const endpoint = '/twilio_profile'
  //   const config = await this.getConfig()
  //   debugHttpOut(endpoint, fields)
  //   await this.http.delete(endpoint, { params: { access_token: config.accessToken }, data: { fields } })
  // }

  // async sendProfile(message) {
  //   await this._callEndpoint('/twilio_profile', message)
  // }

  // private async _callEndpoint(endpoint: string, body) {
  //   const config = await this.getConfig()
  //   debugHttpOut(endpoint, body)
  //   await this.http.post(endpoint, body, { params: { access_token: config.accessToken } })
  // }
}

// function parseTyping(typing) {
//   if (isNaN(typing)) {
//     return 1000
//   }

//   return Math.max(typing, 500)
// }
