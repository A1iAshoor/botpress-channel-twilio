/** #TopLevel */
export interface Config {
  /**
   * This this in the LOCAL config (unique to every bot/page)
   * Whether or not the messenger module is enabled for this bot
   * @default false
   */
  enabled: boolean
  /**
   * This this in the LOCAL config (unique to every bot/page)
   * The Facebook Page Access Token
   */
  accountSID: string
  /**
   * This this in the GLOBAL config (same for all bots)
   * Your app's "App Secret"
   * Find this secret in your developers.facebook.com -> your app -> Settings -> Basic -> App Secret -> Show
   */
  authToken: string
  /**
   * Set this in the GLOBAL config (same for all the bots)
   * The verify token, should be a random string unique to your server. This is a random (hard to guess) string of your choosing.
   * Docs: https://developers.facebook.com/docs/messenger-platform/getting-started/webhook-setup/#verify_webhook
   */
  fromNumber: string
}

// export interface PersistentMenuItem {
//   locale: string
//   composer_input_disabled?: boolean
//   call_to_actions?: CallToAction[] | null
// }

// export type CallToAction = WebUrlButton | PostbackButton | NestedButton

// export interface WebUrlButton {
//   type: 'web_url'
//   url: string
//   title: string
// }

// export interface PostbackButton {
//   type: 'postback'
//   title: string
//   payload: string
// }

// export interface NestedButton {
//   type: 'nested'
//   title: string
//   call_to_actions: CallToAction[]
// }
