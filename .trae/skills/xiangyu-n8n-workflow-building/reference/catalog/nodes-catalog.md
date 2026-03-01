# n8n 节点目录

> n8n v2.7.0 (06e48e5b3b) | 生成于 2026-02-11 19:22:29
> 共 540 个节点，28 个分类
> 包含 nodes-base + @n8n/nodes-langchain 双包

## 分类概览

| 分类 | 数量 |
|------|------|
| Triggers | 101 |
| Core Nodes | 62 |
| Analytics | 11 |
| Communication | 58 |
| Data & Storage | 31 |
| Development | 56 |
| ECM | 1 |
| Finance & Accounting | 8 |
| Marketing | 25 |
| Miscellaneous | 13 |
| Other | 10 |
| Productivity | 25 |
| Sales | 19 |
| Utility | 14 |
| AI Agents | 3 |
| AI Chains | 6 |
| AI Document Loaders | 4 |
| AI Embeddings | 10 |
| AI MCP | 2 |
| AI Memory | 9 |
| AI Models | 25 |
| AI Output Parsers | 3 |
| AI Rerankers | 1 |
| AI Retrievers | 4 |
| AI Text Splitters | 3 |
| AI Tools | 13 |
| AI Triggers | 4 |
| AI Vector Stores | 19 |

## Triggers (101)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| ActiveCampaignTrigger | `nodes-base.activeCampaignTrigger` | ActiveCampaignApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.activecampaigntrigger/) |
| AcuitySchedulingTrigger | `nodes-base.acuitySchedulingTrigger` | AcuitySchedulingApi, AcuitySchedulingOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.acuityschedulingtrigger/) |
| AffinityTrigger | `nodes-base.affinityTrigger` | AffinityApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.affinitytrigger/) |
| AirtableTrigger | `nodes-base.airtableTrigger` | AirtableApi, AirtableOAuth2Api, AirtableTokenApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.airtabletrigger/) |
| AmqpTrigger | `nodes-base.amqpTrigger` | Amqp | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.amqptrigger/) |
| AsanaTrigger | `nodes-base.asanaTrigger` | AsanaApi, AsanaOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.asanatrigger/) |
| AutopilotTrigger | `nodes-base.autopilotTrigger` | AutopilotApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.autopilottrigger/) |
| AwsSnsTrigger | `nodes-base.awsSnsTrigger` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.awssnstrigger/) |
| BitbucketTrigger | `nodes-base.bitbucketTrigger` | BitbucketAccessTokenApi, BitbucketApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.bitbuckettrigger/) |
| BoxTrigger | `nodes-base.boxTrigger` | BoxOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.boxtrigger/) |
| BrevoTrigger | `nodes-base.sendInBlueTrigger` | BrevoApi | — |
| CalendlyTrigger | `nodes-base.calendlyTrigger` | CalendlyApi, CalendlyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.calendlytrigger/) |
| CalTrigger | `nodes-base.calTrigger` | CalApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.caltrigger/) |
| ChargebeeTrigger | `nodes-base.chargebeeTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.chargebeetrigger/) |
| CiscoWebexTrigger | `nodes-base.ciscoWebexTrigger` | CiscoWebexOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.ciscowebextrigger/) |
| ClickUpTrigger | `nodes-base.clickUpTrigger` | ClickUpApi, ClickUpOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.clickuptrigger/) |
| ClockifyTrigger | `nodes-base.clockifyTrigger` | ClockifyApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.clockifytrigger/) |
| ConvertKitTrigger | `nodes-base.convertKitTrigger` | ConvertKitApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.convertkittrigger/) |
| CopperTrigger | `nodes-base.copperTrigger` | CopperApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.coppertrigger/) |
| CustomerIoTrigger | `nodes-base.customerIoTrigger` | CustomerIoApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.customeriotrigger/) |
| EmeliaTrigger | `nodes-base.emeliaTrigger` | EmeliaApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.emeliatrigger/) |
| ErrorTrigger | `nodes-base.errorTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.errortrigger/) |
| EvaluationTrigger | `nodes-base.evaluationTrigger` | GoogleApi, GoogleSheetsOAuth2Api | — |
| EventbriteTrigger | `nodes-base.eventbriteTrigger` | EventbriteApi, EventbriteOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.eventbritetrigger/) |
| ExecuteWorkflowTrigger | `nodes-base.executeWorkflowTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger/) |
| FacebookLeadAdsTrigger | `nodes-base.facebookLeadAdsTrigger` | FacebookLeadAdsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebookleadadstrigger/) |
| FacebookTrigger | `nodes-base.facebookTrigger` | FacebookGraphAppApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.facebooktrigger/) |
| FigmaTrigger | `nodes-base.figmaTrigger` | FigmaApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.figmatrigger/) |
| FlowTrigger | `nodes-base.flowTrigger` | FlowApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.flowtrigger/) |
| FormIoTrigger | `nodes-base.formIoTrigger` | FormIoApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.formiotrigger/) |
| FormstackTrigger | `nodes-base.formstackTrigger` | FormstackApi, FormstackOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.formstacktrigger/) |
| FormTrigger | `nodes-base.formTrigger` | HttpBasicAuth | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/) |
| GetResponseTrigger | `nodes-base.getResponseTrigger` | GetResponseApi, GetResponseOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.getresponsetrigger/) |
| GithubTrigger | `nodes-base.githubTrigger` | GithubApi, GithubOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.githubtrigger/) |
| GitlabTrigger | `nodes-base.gitlabTrigger` | GitlabApi, GitlabOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gitlabtrigger/) |
| GmailTrigger | `nodes-base.gmailTrigger` | GmailOAuth2Api, GoogleApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gmailtrigger/) |
| GoogleBusinessProfileTrigger | `nodes-base.googleBusinessProfileTrigger` | GoogleBusinessProfileOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlebusinessprofiletrigger/) |
| GoogleCalendarTrigger | `nodes-base.googleCalendarTrigger` | GoogleCalendarOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlecalendartrigger/) |
| GoogleDriveTrigger | `nodes-base.googleDriveTrigger` | GoogleApi, GoogleDriveOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googledrivetrigger/) |
| GoogleSheetsTrigger | `nodes-base.googleSheetsTrigger` | GoogleSheetsTriggerOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlesheetstrigger/) |
| GumroadTrigger | `nodes-base.gumroadTrigger` | GumroadApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.gumroadtrigger/) |
| HelpScoutTrigger | `nodes-base.helpScoutTrigger` | HelpScoutOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.helpscouttrigger/) |
| HubspotTrigger | `nodes-base.hubspotTrigger` | HubspotDeveloperApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.hubspottrigger/) |
| InvoiceNinjaTrigger | `nodes-base.invoiceNinjaTrigger` | InvoiceNinjaApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.invoiceninjatrigger/) |
| JiraTrigger | `nodes-base.jiraTrigger` | HttpQueryAuth, HttpQueryAuth, JiraSoftwareCloudApi, JiraSoftwareServerApi, JiraSoftwareServerPatApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.jiratrigger/) |
| JotFormTrigger | `nodes-base.jotFormTrigger` | JotFormApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.jotformtrigger/) |
| KafkaTrigger | `nodes-base.kafkaTrigger` | Kafka | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.kafkatrigger/) |
| KeapTrigger | `nodes-base.keapTrigger` | KeapOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.keaptrigger/) |
| KoBoToolboxTrigger | `nodes-base.koBoToolboxTrigger` | KoBoToolboxApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.kobotoolboxtrigger/) |
| LemlistTrigger | `nodes-base.lemlistTrigger` | LemlistApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.lemlisttrigger/) |
| LinearTrigger | `nodes-base.linearTrigger` | LinearApi, LinearOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.lineartrigger/) |
| LocalFileTrigger | `nodes-base.localFileTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.localfiletrigger/) |
| LoneScaleTrigger | `nodes-base.loneScaleTrigger` | LoneScaleApi | — |
| MailchimpTrigger | `nodes-base.mailchimpTrigger` | MailchimpApi, MailchimpOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mailchimptrigger/) |
| MailerLiteTrigger | `nodes-base.mailerLiteTrigger` | MailerLiteApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mailerlitetrigger/) |
| MailjetTrigger | `nodes-base.mailjetTrigger` | MailjetEmailApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mailjettrigger/) |
| ManualTrigger | `nodes-base.manualTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.manualworkflowtrigger/) |
| MauticTrigger | `nodes-base.mauticTrigger` | MauticApi, MauticOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mautictrigger/) |
| MicrosoftOneDriveTrigger | `nodes-base.microsoftOneDriveTrigger` | MicrosoftOneDriveOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.microsoftonedrivetrigger/) |
| MicrosoftOutlookTrigger | `nodes-base.microsoftOutlookTrigger` | MicrosoftOutlookOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.microsoftoutlooktrigger/) |
| MicrosoftTeamsTrigger | `nodes-base.microsoftTeamsTrigger` | MicrosoftTeamsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.microsoftteamstrigger/) |
| MqttTrigger | `nodes-base.mqttTrigger` | Mqtt | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.mqtttrigger/) |
| N8nTrigger | `nodes-base.n8nTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.n8ntrigger/) |
| NetlifyTrigger | `nodes-base.netlifyTrigger` | NetlifyApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.netlifytrigger/) |
| NotionTrigger | `nodes-base.notionTrigger` | NotionApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.notiontrigger/) |
| OnfleetTrigger | `nodes-base.onfleetTrigger` | OnfleetApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.onfleettrigger/) |
| PayPalTrigger | `nodes-base.payPalTrigger` | PayPalApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.paypaltrigger/) |
| PipedriveTrigger | `nodes-base.pipedriveTrigger` | HttpBasicAuth, PipedriveApi, PipedriveOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.pipedrivetrigger/) |
| PostgresTrigger | `nodes-base.postgresTrigger` | Postgres | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.postgrestrigger/) |
| PostmarkTrigger | `nodes-base.postmarkTrigger` | PostmarkApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.postmarktrigger/) |
| PushcutTrigger | `nodes-base.pushcutTrigger` | PushcutApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.pushcuttrigger/) |
| RabbitMQTrigger | `nodes-base.rabbitmqTrigger` | RabbitMQ | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.rabbitmqtrigger/) |
| RedisTrigger | `nodes-base.redisTrigger` | Redis | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.redistrigger/) |
| RssFeedReadTrigger | `nodes-base.rssFeedReadTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedreadtrigger/) |
| SalesforceTrigger | `nodes-base.salesforceTrigger` | SalesforceOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.salesforcetrigger/) |
| ScheduleTrigger | `nodes-base.scheduleTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/) |
| SeaTableTrigger | `nodes-base.seaTableTrigger` | SeaTableApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.seatabletrigger/) |
| ShopifyTrigger | `nodes-base.shopifyTrigger` | ShopifyApi, ShopifyAccessTokenApi, ShopifyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.shopifytrigger/) |
| SimulateTrigger | `nodes-base.simulateTrigger` | — | — |
| SlackTrigger | `nodes-base.slackTrigger` | SlackApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.slacktrigger/) |
| SseTrigger | `nodes-base.sseTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ssetrigger/) |
| StravaTrigger | `nodes-base.stravaTrigger` | StravaOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.stravatrigger/) |
| StripeTrigger | `nodes-base.stripeTrigger` | StripeApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.stripetrigger/) |
| SurveyMonkeyTrigger | `nodes-base.surveyMonkeyTrigger` | SurveyMonkeyApi, SurveyMonkeyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.surveymonkeytrigger/) |
| TaigaTrigger | `nodes-base.taigaTrigger` | TaigaApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.taigatrigger/) |
| TelegramTrigger | `nodes-base.telegramTrigger` | TelegramApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/) |
| TheHiveProjectTrigger | `nodes-base.theHiveProjectTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.thehive5trigger/) |
| TheHiveTrigger | `nodes-base.theHiveTrigger` | — | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.thehivetrigger/) |
| TogglTrigger | `nodes-base.togglTrigger` | TogglApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.toggltrigger/) |
| TrelloTrigger | `nodes-base.trelloTrigger` | TrelloApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.trellotrigger/) |
| TwilioTrigger | `nodes-base.twilioTrigger` | TwilioApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.twiliotrigger/) |
| TypeformTrigger | `nodes-base.typeformTrigger` | TypeformApi, TypeformOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.typeformtrigger/) |
| VenafiTlsProtectCloudTrigger | `nodes-base.venafiTlsProtectCloudTrigger` | VenafiTlsProtectCloudApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.venafitlsprotectcloudtrigger/) |
| WebflowTrigger | `nodes-base.webflowTrigger` | WebflowApi, WebflowOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.webflowtrigger/) |
| WhatsAppTrigger | `nodes-base.whatsAppTrigger` | WhatsAppTriggerApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.whatsapptrigger/) |
| WiseTrigger | `nodes-base.wiseTrigger` | WiseApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.wisetrigger/) |
| WooCommerceTrigger | `nodes-base.wooCommerceTrigger` | WooCommerceApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.woocommercetrigger/) |
| WorkableTrigger | `nodes-base.workableTrigger` | WorkableApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.workabletrigger/) |
| WorkflowTrigger | `nodes-base.workflowTrigger` | — | — |
| WufooTrigger | `nodes-base.wufooTrigger` | WufooApi | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.wufootrigger/) |
| ZendeskTrigger | `nodes-base.zendeskTrigger` | ZendeskApi, ZendeskOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.zendesktrigger/) |

## Core Nodes (62)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Aggregate | `nodes-base.aggregate` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/) |
| AiTransform | `nodes-base.aiTransform` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aitransform/) |
| Code | `nodes-base.code` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/) |
| CompareDatasets | `nodes-base.compareDatasets` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.comparedatasets/) |
| Compression | `nodes-base.compression` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.compression/) |
| ConvertToFile | `nodes-base.convertToFile` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/) |
| Cron | `nodes-base.cron` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/) |
| Crypto | `nodes-base.crypto` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.crypto/) |
| DataTable | `nodes-base.dataTable` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/) |
| DateTime | `nodes-base.dateTime` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datetime/) |
| E2eTest | `nodes-base.e2eTest` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.editimage/) |
| EditImage | `nodes-base.editImage` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.editimage/) |
| EmailReadImap | `nodes-base.emailReadImap` | Imap | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.emailimap/) |
| EmailSend | `nodes-base.emailSend` | Smtp | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/) |
| ExecuteCommand | `nodes-base.executeCommand` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/) |
| ExecuteWorkflow | `nodes-base.executeWorkflow` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow/) |
| ExecutionData | `nodes-base.executionData` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executiondata/) |
| ExtractFromFile | `nodes-base.extractFromFile` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.extractfromfile/) |
| Filter | `nodes-base.filter` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter/) |
| Form | `nodes-base.form` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.form/) |
| Ftp | `nodes-base.ftp` | Ftp, Sftp | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ftp/) |
| Function | `nodes-base.function` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/) |
| FunctionItem | `nodes-base.functionItem` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/) |
| Git | `nodes-base.git` | GitPassword | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.git/) |
| Html | `nodes-base.html` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html/) |
| HtmlExtract | `nodes-base.htmlExtract` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html/) |
| HttpRequest | `nodes-base.httpRequest` | HttpBasicAuth, HttpDigestAuth, HttpHeaderAuth, HttpQueryAuth, HttpSslAuth, OAuth1Api, OAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) |
| ICalendar | `nodes-base.iCal` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/) |
| If | `nodes-base.if` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/) |
| Interval | `nodes-base.interval` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.interval/) |
| ItemLists | `nodes-base.itemLists` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.itemlists/) |
| Limit | `nodes-base.limit` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit/) |
| Markdown | `nodes-base.markdown` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.markdown/) |
| Merge | `nodes-base.merge` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/) |
| MoveBinaryData | `nodes-base.moveBinaryData` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/) |
| N8n | `nodes-base.n8n` | N8nApi | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.n8n/) |
| NoOp | `nodes-base.noOp` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.noop/) |
| ReadBinaryFile | `nodes-base.readBinaryFile` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile/) |
| ReadBinaryFiles | `nodes-base.readBinaryFiles` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile/) |
| ReadPDF | `nodes-base.readPDF` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.extractfromfile/) |
| ReadWriteFile | `nodes-base.readWriteFile` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile/) |
| RemoveDuplicates | `nodes-base.removeDuplicates` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.removeduplicates/) |
| RenameKeys | `nodes-base.renameKeys` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.renamekeys/) |
| RespondToWebhook | `nodes-base.respondToWebhook` | JwtAuth | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/) |
| RssFeedRead | `nodes-base.rssFeedRead` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.rssfeedread/) |
| Set | `nodes-base.set` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set/) |
| Simulate | `nodes-base.simulate` | — | — |
| Sort | `nodes-base.sort` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sort/) |
| SplitInBatches | `nodes-base.splitInBatches` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/) |
| SplitOut | `nodes-base.splitOut` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout/) |
| SpreadsheetFile | `nodes-base.spreadsheetFile` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.converttofile/) |
| Ssh | `nodes-base.ssh` | SshPassword, SshPrivateKey | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ssh/) |
| StickyNote | `nodes-base.stickyNote` | — | — |
| StopAndError | `nodes-base.stopAndError` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.stopanderror/) |
| Summarize | `nodes-base.summarize` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.summarize/) |
| Switch | `nodes-base.switch` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.switch/) |
| TimeSaved | `nodes-base.timeSaved` | — | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.savedTime/) |
| Totp | `nodes-base.totp` | TotpApi | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.totp/) |
| Wait | `nodes-base.wait` | HttpBasicAuth, HttpHeaderAuth, JwtAuth | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/) |
| Webhook | `nodes-base.webhook` | HttpBasicAuth, HttpHeaderAuth, JwtAuth | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) |
| WriteBinaryFile | `nodes-base.writeBinaryFile` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile/) |
| Xml | `nodes-base.xml` | — | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.xml/) |

## Analytics (11)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| GoogleAds | `nodes-base.googleAds` | GoogleAdsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleads/) |
| GoogleAnalytics | `nodes-base.googleAnalytics` | GoogleAnalyticsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleanalytics/) |
| GoogleCloudNaturalLanguage | `nodes-base.googleCloudNaturalLanguage` | GoogleCloudNaturalLanguageOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudnaturallanguage/) |
| GooglePerspective | `nodes-base.googlePerspective` | GooglePerspectiveOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleperspective/) |
| HumanticAi | `nodes-base.humanticAi` | HumanticAiApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.humanticai/) |
| Marketstack | `nodes-base.marketstack` | MarketstackApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.marketstack/) |
| Orbit | `nodes-base.orbit` | OrbitApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.orbit/) |
| PostHog | `nodes-base.postHog` | PostHogApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.posthog/) |
| ProfitWell | `nodes-base.profitWell` | ProfitWellApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.profitwell/) |
| SecurityScorecard | `nodes-base.securityScorecard` | SecurityScorecardApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.securityscorecard/) |
| Segment | `nodes-base.segment` | SegmentApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.segment/) |

## Communication (58)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| AwsSes | `nodes-base.awsSes` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsses/) |
| CiscoWebex | `nodes-base.ciscoWebex` | CiscoWebexOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.ciscowebex/) |
| CustomerIo | `nodes-base.customerIo` | CustomerIoApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.customerio/) |
| Demio | `nodes-base.demio` | DemioApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.demio/) |
| Discord | `nodes-base.discord` | DiscordBotApi, DiscordOAuth2Api, DiscordWebhookApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discord/) |
| Discourse | `nodes-base.discourse` | DiscourseApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.discourse/) |
| Disqus | `nodes-base.disqus` | DisqusApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.disqus/) |
| Egoi | `nodes-base.egoi` | EgoiApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.egoi/) |
| Emelia | `nodes-base.emelia` | EmeliaApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.emelia/) |
| Freshdesk | `nodes-base.freshdesk` | FreshdeskApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.freshdesk/) |
| GetResponse | `nodes-base.getResponse` | GetResponseApi, GetResponseOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.getresponse/) |
| Gmail | `nodes-base.gmail` | GmailOAuth2Api, GoogleApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/) |
| GoogleChat | `nodes-base.googleChat` | GoogleApi, GoogleChatOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlechat/) |
| Gotify | `nodes-base.gotify` | GotifyApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gotify/) |
| GoToWebinar | `nodes-base.goToWebinar` | GoToWebinarOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gotowebinar/) |
| HackerNews | `nodes-base.hackerNews` | — | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hackernews/) |
| HaloPSA | `nodes-base.haloPSA` | HaloPSAApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.halopsa/) |
| HelpScout | `nodes-base.helpScout` | HelpScoutOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.helpscout/) |
| Intercom | `nodes-base.intercom` | IntercomApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.intercom/) |
| Iterable | `nodes-base.iterable` | IterableApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.iterable/) |
| KoBoToolbox | `nodes-base.koBoToolbox` | KoBoToolboxApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.kobotoolbox/) |
| Lemlist | `nodes-base.lemlist` | LemlistApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.lemlist/) |
| Line | `nodes-base.line` | LineNotifyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.line/) |
| MailerLite | `nodes-base.mailerLite` | MailerLiteApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailerlite/) |
| Mailgun | `nodes-base.mailgun` | MailgunApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailgun/) |
| Mailjet | `nodes-base.mailjet` | MailjetEmailApi, MailjetSmsApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailjet/) |
| Mandrill | `nodes-base.mandrill` | MandrillApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mandrill/) |
| Matrix | `nodes-base.matrix` | MatrixApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.matrix/) |
| Mattermost | `nodes-base.mattermost` | MattermostApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mattermost/) |
| MessageBird | `nodes-base.messageBird` | MessageBirdApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.messagebird/) |
| MicrosoftOutlook | `nodes-base.microsoftOutlook` | MicrosoftOutlookOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftoutlook/) |
| MicrosoftTeams | `nodes-base.microsoftTeams` | MicrosoftTeamsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftteams/) |
| Mocean | `nodes-base.mocean` | MoceanApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mocean/) |
| MonicaCrm | `nodes-base.monicaCrm` | MonicaCrmApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.monicacrm/) |
| Msg91 | `nodes-base.msg91` | Msg91Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.msg91/) |
| PagerDuty | `nodes-base.pagerDuty` | PagerDutyApi, PagerDutyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pagerduty/) |
| Plivo | `nodes-base.plivo` | PlivoApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.plivo/) |
| Pushbullet | `nodes-base.pushbullet` | PushbulletOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pushbullet/) |
| Pushcut | `nodes-base.pushcut` | PushcutApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pushcut/) |
| Pushover | `nodes-base.pushover` | PushoverApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pushover/) |
| Reddit | `nodes-base.reddit` | RedditOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.reddit/) |
| Rocketchat | `nodes-base.rocketchat` | RocketchatApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.rocketchat/) |
| Rundeck | `nodes-base.rundeck` | RundeckApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.rundeck/) |
| Sendy | `nodes-base.sendy` | SendyApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sendy/) |
| Signl4 | `nodes-base.signl4` | Signl4Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.signl4/) |
| Slack | `nodes-base.slack` | SlackApi, SlackOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.slack/) |
| Sms77 | `nodes-base.sms77` | Sms77Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sms77/) |
| Telegram | `nodes-base.telegram` | TelegramApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/) |
| Twilio | `nodes-base.twilio` | TwilioApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twilio/) |
| Twist | `nodes-base.twist` | TwistOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twist/) |
| Vero | `nodes-base.vero` | VeroApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.vero/) |
| Vonage | `nodes-base.vonage` | VonageApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.vonage/) |
| WhatsApp | `nodes-base.whatsApp` | WhatsAppApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp/) |
| Zammad | `nodes-base.zammad` | ZammadBasicAuthApi, ZammadTokenAuthApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zammad/) |
| Zendesk | `nodes-base.zendesk` | ZendeskApi, ZendeskOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zendesk/) |
| ZohoCrm | `nodes-base.zohoCrm` | ZohoOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zohocrm/) |
| Zoom | `nodes-base.zoom` | ZoomApi, ZoomOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zoom/) |
| Zulip | `nodes-base.zulip` | ZulipApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.zulip/) |

## Data & Storage (31)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Adalo | `nodes-base.adalo` | AdaloApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.adalo/) |
| Airtable | `nodes-base.airtable` | AirtableApi, AirtableOAuth2Api, AirtableTokenApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtable/) |
| AwsDynamoDB | `nodes-base.awsDynamoDb` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsdynamodb/) |
| AzureCosmosDb | `nodes-base.azureCosmosDb` | MicrosoftAzureCosmosDbSharedKeyApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.azurecosmosdb/) |
| AzureStorage | `nodes-base.azureStorage` | AzureStorageOAuth2Api, AzureStorageSharedKeyApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.azurestorage/) |
| Baserow | `nodes-base.baserow` | BaserowApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.baserow/) |
| Bitwarden | `nodes-base.bitwarden` | BitwardenApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bitwarden/) |
| Box | `nodes-base.box` | BoxOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.box/) |
| Dropbox | `nodes-base.dropbox` | DropboxApi, DropboxOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dropbox/) |
| GoogleBigQuery | `nodes-base.googleBigQuery` | GoogleApi, GoogleBigQueryOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebigquery/) |
| GoogleDrive | `nodes-base.googleDrive` | GoogleApi, GoogleDriveOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/) |
| GoogleFirebaseCloudFirestore | `nodes-base.googleFirebaseCloudFirestore` | GoogleApi, GoogleFirebaseCloudFirestoreOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudfirestore/) |
| GoogleFirebaseRealtimeDatabase | `nodes-base.googleFirebaseRealtimeDatabase` | GoogleFirebaseRealtimeDatabaseOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudrealtimedatabase/) |
| GoogleSheets | `nodes-base.googleSheets` | GoogleApi, GoogleSheetsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/) |
| GraphQL | `nodes-base.graphql` | HttpBasicAuth, HttpDigestAuth, HttpHeaderAuth, HttpCustomAuth, HttpQueryAuth, OAuth1Api, OAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.graphql/) |
| Grist | `nodes-base.grist` | GristApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.grist/) |
| MicrosoftExcel | `nodes-base.microsoftExcel` | MicrosoftExcelOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftexcel/) |
| MicrosoftOneDrive | `nodes-base.microsoftOneDrive` | MicrosoftOneDriveOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftonedrive/) |
| NextCloud | `nodes-base.nextCloud` | NextCloudApi, NextCloudOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nextcloud/) |
| NocoDB | `nodes-base.nocoDb` | NocoDb, NocoDbApiToken | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nocodb/) |
| Odoo | `nodes-base.odoo` | OdooApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.odoo/) |
| QuestDb | `nodes-base.questDb` | QuestDb | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.questdb/) |
| QuickBase | `nodes-base.quickbase` | QuickBaseApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbase/) |
| SeaTable | `nodes-base.seaTable` | SeaTableApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.seatable/) |
| Snowflake | `nodes-base.snowflake` | Snowflake | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.snowflake/) |
| Stackby | `nodes-base.stackby` | StackbyApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.stackby/) |
| Storyblok | `nodes-base.storyblok` | StoryblokContentApi, StoryblokManagementApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.storyblok/) |
| Strapi | `nodes-base.strapi` | StrapiApi, StrapiTokenApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.strapi/) |
| Supabase | `nodes-base.supabase` | SupabaseApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.supabase/) |
| TimescaleDb | `nodes-base.timescaleDb` | TimescaleDb | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.timescaledb/) |
| UProc | `nodes-base.uproc` | UProcApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.uproc/) |

## Development (56)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Amqp | `nodes-base.amqp` | Amqp | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.amqp/) |
| AwsCertificateManager | `nodes-base.awsCertificateManager` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awscertificatemanager/) |
| AwsCognito | `nodes-base.awsCognito` | Aws | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awscognito/) |
| AwsComprehend | `nodes-base.awsComprehend` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awscomprehend/) |
| AwsElb | `nodes-base.awsElb` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awselb/) |
| AwsLambda | `nodes-base.awsLambda` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awslambda/) |
| AwsRekognition | `nodes-base.awsRekognition` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsrekognition/) |
| AwsS3 | `nodes-base.awsS3` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awss3/) |
| AwsSns | `nodes-base.awsSns` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awssns/) |
| AwsSqs | `nodes-base.awsSqs` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awssqs/) |
| AwsTranscribe | `nodes-base.awsTranscribe` | Aws | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awstranscribe/) |
| Bubble | `nodes-base.bubble` | BubbleApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bubble/) |
| CircleCi | `nodes-base.circleCi` | CircleCiApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.circleci/) |
| Cloudflare | `nodes-base.cloudflare` | CloudflareApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cloudflare/) |
| Cortex | `nodes-base.cortex` | CortexApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cortex/) |
| CrateDb | `nodes-base.crateDb` | CrateDb | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cratedb/) |
| Elasticsearch | `nodes-base.elasticsearch` | ElasticsearchApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.elasticsearch/) |
| ElasticSecurity | `nodes-base.elasticSecurity` | ElasticSecurityApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.elasticsecurity/) |
| FacebookGraphApi | `nodes-base.facebookGraphApi` | FacebookGraphApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.facebookgraphapi/) |
| FileMaker | `nodes-base.filemaker` | FileMaker | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.filemaker/) |
| Github | `nodes-base.github` | GithubApi, GithubOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.github/) |
| Gitlab | `nodes-base.gitlab` | GitlabApi, GitlabOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gitlab/) |
| Gong | `nodes-base.gong` | GongApi, GongOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gong/) |
| GoogleCloudStorage | `nodes-base.googleCloudStorage` | GoogleCloudStorageOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecloudstorage/) |
| Grafana | `nodes-base.grafana` | GrafanaApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.grafana/) |
| Jenkins | `nodes-base.jenkins` | JenkinsApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jenkins/) |
| Jira | `nodes-base.jira` | JiraSoftwareCloudApi, JiraSoftwareServerApi, JiraSoftwareServerPatApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jira/) |
| Jwt | `nodes-base.jwt` | JwtAuth | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.jwt/) |
| Kafka | `nodes-base.kafka` | Kafka | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.kafka/) |
| Ldap | `nodes-base.ldap` | Ldap | [docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.ldap/) |
| Metabase | `nodes-base.metabase` | MetabaseApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.metabase/) |
| MicrosoftEntra | `nodes-base.microsoftEntra` | MicrosoftEntraOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftentra/) |
| MicrosoftGraphSecurity | `nodes-base.microsoftGraphSecurity` | MicrosoftGraphSecurityOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftgraphsecurity/) |
| MicrosoftSql | `nodes-base.microsoftSql` | MicrosoftSql | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftsql/) |
| Misp | `nodes-base.misp` | MispApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.misp/) |
| MongoDb | `nodes-base.mongoDb` | MongoDb | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mongodb/) |
| Mqtt | `nodes-base.mqtt` | Mqtt | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mqtt/) |
| MySql | `nodes-base.mySql` | MySql | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mysql/) |
| Netlify | `nodes-base.netlify` | NetlifyApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.netlify/) |
| Npm | `nodes-base.npm` | NpmApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.npm/) |
| Okta | `nodes-base.okta` | OktaApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.okta/) |
| Peekalink | `nodes-base.peekalink` | PeekalinkApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.peekalink/) |
| Postgres | `nodes-base.postgres` | Postgres | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/) |
| RabbitMQ | `nodes-base.rabbitmq` | RabbitMQ | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.rabbitmq/) |
| Redis | `nodes-base.redis` | Redis | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.redis/) |
| S3 | `nodes-base.s3` | S3 | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.s3/) |
| SentryIo | `nodes-base.sentryIo` | SentryIoApi, SentryIoOAuth2Api, SentryIoServerApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sentryio/) |
| Splunk | `nodes-base.splunk` | SplunkApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.splunk/) |
| Taiga | `nodes-base.taiga` | TaigaApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.taiga/) |
| TheHive | `nodes-base.theHive` | TheHiveApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.thehive/) |
| TheHiveProject | `nodes-base.theHiveProject` | TheHiveProjectApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.thehive5/) |
| TravisCi | `nodes-base.travisCi` | TravisCiApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.travisci/) |
| UptimeRobot | `nodes-base.uptimeRobot` | UptimeRobotApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.uptimerobot/) |
| UrlScanIo | `nodes-base.urlScanIo` | UrlScanIoApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.urlscanio/) |
| VenafiTlsProtectCloud | `nodes-base.venafiTlsProtectCloud` | VenafiTlsProtectCloudApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.venafitlsprotectcloud/) |
| VenafiTlsProtectDatacenter | `nodes-base.venafiTlsProtectDatacenter` | VenafiTlsProtectDatacenterApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.venafitlsprotectdatacenter/) |

## ECM (1)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| MicrosoftSharePoint | `nodes-base.microsoftSharePoint` | MicrosoftSharePointOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftsharepoint/) |

## Finance & Accounting (8)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Chargebee | `nodes-base.chargebee` | ChargebeeApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.chargebee/) |
| ERPNext | `nodes-base.erpNext` | ERPNextApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.erpnext/) |
| InvoiceNinja | `nodes-base.invoiceNinja` | InvoiceNinjaApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.invoiceninja/) |
| PayPal | `nodes-base.payPal` | PayPalApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.paypal/) |
| QuickBooks | `nodes-base.quickbooks` | QuickBooksOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickbooks/) |
| Stripe | `nodes-base.stripe` | StripeApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.stripe/) |
| Wise | `nodes-base.wise` | WiseApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wise/) |
| Xero | `nodes-base.xero` | XeroOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.xero/) |

## Marketing (25)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| ActiveCampaign | `nodes-base.activeCampaign` | ActiveCampaignApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.activecampaign/) |
| AgileCrm | `nodes-base.agileCrm` | AgileCrmApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.agilecrm/) |
| ApiTemplateIo | `nodes-base.apiTemplateIo` | ApiTemplateIoApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.apitemplateio/) |
| Autopilot | `nodes-base.autopilot` | AutopilotApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.autopilot/) |
| Bannerbear | `nodes-base.bannerbear` | BannerbearApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bannerbear/) |
| Cockpit | `nodes-base.cockpit` | CockpitApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.cockpit/) |
| Contentful | `nodes-base.contentful` | ContentfulApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.contentful/) |
| ConvertKit | `nodes-base.convertKit` | ConvertKitApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.convertkit/) |
| Copper | `nodes-base.copper` | CopperApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.copper/) |
| FreshworksCrm | `nodes-base.freshworksCrm` | FreshworksCrmApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.freshworkscrm/) |
| Ghost | `nodes-base.ghost` | GhostAdminApi, GhostContentApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.ghost/) |
| GoogleBusinessProfile | `nodes-base.googleBusinessProfile` | GoogleBusinessProfileOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebusinessprofile/) |
| GoogleSlides | `nodes-base.googleSlides` | GoogleApi, GoogleSlidesOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleslides/) |
| HighLevel | `nodes-base.highLevel` | HighLevelApi, HighLevelOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.highlevel/) |
| LinkedIn | `nodes-base.linkedIn` | LinkedInCommunityManagementOAuth2Api, LinkedInOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.linkedin/) |
| Mailchimp | `nodes-base.mailchimp` | MailchimpApi, MailchimpOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailchimp/) |
| Mautic | `nodes-base.mautic` | MauticApi, MauticOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mautic/) |
| Medium | `nodes-base.medium` | MediumApi, MediumOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.medium/) |
| MicrosoftDynamicsCrm | `nodes-base.microsoftDynamicsCrm` | MicrosoftDynamicsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftdynamicscrm/) |
| QuickChart | `nodes-base.quickChart` | — | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.quickchart/) |
| SendGrid | `nodes-base.sendGrid` | SendGridApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.sendgrid/) |
| Twitter | `nodes-base.twitter` | TwitterOAuth1Api, TwitterOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twitter/) |
| Webflow | `nodes-base.webflow` | WebflowApi, WebflowOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.webflow/) |
| Wordpress | `nodes-base.wordpress` | WordpressApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wordpress/) |
| YouTube | `nodes-base.youTube` | YouTubeOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.youtube/) |

## Miscellaneous (13)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| BambooHr | `nodes-base.bambooHr` | BambooHrApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bamboohr/) |
| Dhl | `nodes-base.dhl` | DhlApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dhl/) |
| GoogleBooks | `nodes-base.googleBooks` | GoogleApi, GoogleBooksOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlebooks/) |
| GoogleContacts | `nodes-base.googleContacts` | GoogleContactsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecontacts/) |
| GoogleDocs | `nodes-base.googleDocs` | GoogleApi, GoogleDocsOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledocs/) |
| HomeAssistant | `nodes-base.homeAssistant` | HomeAssistantApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.homeassistant/) |
| JinaAi | `nodes-base.jinaAi` | JinaAiApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.jinaai/) |
| LingvaNex | `nodes-base.lingvaNex` | LingvaNexApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.lingvanex/) |
| Nasa | `nodes-base.nasa` | NasaApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nasa/) |
| Onfleet | `nodes-base.onfleet` | OnfleetApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.onfleet/) |
| OpenWeatherMap | `nodes-base.openWeatherMap` | OpenWeatherMapApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.openweathermap/) |
| PhilipsHue | `nodes-base.philipsHue` | PhilipsHueOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.philipshue/) |
| Spotify | `nodes-base.spotify` | SpotifyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.spotify/) |

## Other (10)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| AwsIam | `nodes-base.awsIam` | Aws | — |
| Brevo | `nodes-base.sendInBlue` | BrevoApi | — |
| DebugHelper | `nodes-base.debugHelper` | — | — |
| Evaluation | `nodes-base.evaluation` | GoogleApi, GoogleSheetsOAuth2Api | — |
| LoneScale | `nodes-base.loneScale` | LoneScaleApi | — |
| N8nTrainingCustomerDatastore | `nodes-base.n8nTrainingCustomerDatastore` | — | — |
| N8nTrainingCustomerMessenger | `nodes-base.n8nTrainingCustomerMessenger` | — | — |
| NetscalerAdc | `nodes-base.citrixAdc` | NetscalerAdcApi | — |
| OracleSql | `nodes-base.oracleDatabase` | OracleDBApi | — |
| PostBin | `nodes-base.postBin` | — | — |

## Productivity (25)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Airtop | `nodes-base.airtop` | AirtopApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.airtop/) |
| Asana | `nodes-base.asana` | AsanaApi, AsanaOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.asana/) |
| Beeminder | `nodes-base.beeminder` | BeeminderApi, BeeminderOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.beeminder/) |
| ClickUp | `nodes-base.clickUp` | ClickUpApi, ClickUpOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clickup/) |
| Clockify | `nodes-base.clockify` | ClockifyApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clockify/) |
| Coda | `nodes-base.coda` | CodaApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.coda/) |
| CoinGecko | `nodes-base.coinGecko` | — | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.coingecko/) |
| Flow | `nodes-base.flow` | FlowApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.flow/) |
| Freshservice | `nodes-base.freshservice` | FreshserviceApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.freshservice/) |
| GoogleCalendar | `nodes-base.googleCalendar` | GoogleCalendarOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/) |
| GoogleTasks | `nodes-base.googleTasks` | GoogleTasksOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletasks/) |
| Harvest | `nodes-base.harvest` | HarvestApi, HarvestOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.harvest/) |
| Linear | `nodes-base.linear` | LinearApi, LinearOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.linear/) |
| MicrosoftToDo | `nodes-base.microsoftToDo` | MicrosoftToDoOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsofttodo/) |
| MondayCom | `nodes-base.mondayCom` | MondayComApi, MondayComOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mondaycom/) |
| Notion | `nodes-base.notion` | NotionApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion/) |
| Oura | `nodes-base.oura` | OuraApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.oura/) |
| Raindrop | `nodes-base.raindrop` | RaindropOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.raindrop/) |
| ServiceNow | `nodes-base.serviceNow` | ServiceNowOAuth2Api, ServiceNowBasicApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.servicenow/) |
| Strava | `nodes-base.strava` | StravaOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.strava/) |
| SyncroMsp | `nodes-base.syncroMsp` | SyncroMspApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.syncromsp/) |
| Todoist | `nodes-base.todoist` | TodoistApi, TodoistOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.todoist/) |
| Trello | `nodes-base.trello` | TrelloApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.trello/) |
| Twake | `nodes-base.twake` | TwakeCloudApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twake/) |
| Wekan | `nodes-base.wekan` | WekanApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wekan/) |

## Sales (19)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| ActionNetwork | `nodes-base.actionNetwork` | ActionNetworkApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.actionnetwork/) |
| Affinity | `nodes-base.affinity` | AffinityApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.affinity/) |
| Clearbit | `nodes-base.clearbit` | ClearbitApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.clearbit/) |
| Drift | `nodes-base.drift` | DriftApi, DriftOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.drift/) |
| Dropcontact | `nodes-base.dropcontact` | DropcontactApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.dropcontact/) |
| Hubspot | `nodes-base.hubspot` | HubspotApi, HubspotAppToken, HubspotOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hubspot/) |
| Hunter | `nodes-base.hunter` | HunterApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.hunter/) |
| Keap | `nodes-base.keap` | KeapOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.keap/) |
| Magento2 | `nodes-base.magento2` | Magento2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.magento2/) |
| Paddle | `nodes-base.paddle` | PaddleApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.paddle/) |
| Phantombuster | `nodes-base.phantombuster` | PhantombusterApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.phantombuster/) |
| Pipedrive | `nodes-base.pipedrive` | PipedriveApi, PipedriveOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pipedrive/) |
| Salesforce | `nodes-base.salesforce` | SalesforceJwtApi, SalesforceOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.salesforce/) |
| Salesmate | `nodes-base.salesmate` | SalesmateApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.salesmate/) |
| Shopify | `nodes-base.shopify` | ShopifyApi, ShopifyAccessTokenApi, ShopifyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.shopify/) |
| Tapfiliate | `nodes-base.tapfiliate` | TapfiliateApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.tapfiliate/) |
| UnleashedSoftware | `nodes-base.unleashedSoftware` | UnleashedSoftwareApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.unleashedsoftware/) |
| Uplead | `nodes-base.uplead` | UpleadApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.uplead/) |
| WooCommerce | `nodes-base.wooCommerce` | WooCommerceApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.woocommerce/) |

## Utility (14)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| AwsTextract | `nodes-base.awsTextract` | Aws, AwsAssumeRole | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awstextract/) |
| Bitly | `nodes-base.bitly` | BitlyApi, BitlyOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bitly/) |
| Brandfetch | `nodes-base.Brandfetch` | BrandfetchApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.brandfetch/) |
| DeepL | `nodes-base.deepL` | DeepLApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.deepl/) |
| GoogleTranslate | `nodes-base.googleTranslate` | GoogleApi, GoogleTranslateOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googletranslate/) |
| GSuiteAdmin | `nodes-base.gSuiteAdmin` | GSuiteAdminOAuth2Api | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gsuiteadmin/) |
| Mailcheck | `nodes-base.mailcheck` | MailcheckApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailcheck/) |
| Mindee | `nodes-base.mindee` | MindeeInvoiceApi, MindeeReceiptApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mindee/) |
| MistralAi | `nodes-base.mistralAi` | — | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mistralai/) |
| OneSimpleApi | `nodes-base.oneSimpleApi` | OneSimpleApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.onesimpleapi/) |
| OpenAi | `nodes-base.openAi` | OpenAiApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.openai/) |
| OpenThesaurus | `nodes-base.openThesaurus` | — | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.openthesaurus/) |
| Perplexity | `nodes-base.perplexity` | PerplexityApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.perplexity/) |
| Yourls | `nodes-base.yourls` | YourlsApi | [docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.yourls/) |

## AI Agents (3)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Agent | `nodes-langchain.agent` | — | — |
| AgentTool | `nodes-langchain.agentTool` | — | — |
| OpenAiAssistant | `nodes-langchain.openAiAssistant` | — | — |

## AI Chains (6)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| ChainLlm | `nodes-langchain.chainLlm` | — | — |
| ChainRetrievalQa | `nodes-langchain.chainRetrievalQa` | — | — |
| ChainSummarization | `nodes-langchain.chainSummarization` | — | — |
| InformationExtractor | `nodes-langchain.informationExtractor` | — | — |
| SentimentAnalysis | `nodes-langchain.sentimentAnalysis` | — | — |
| TextClassifier | `nodes-langchain.textClassifier` | — | — |

## AI Document Loaders (4)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| DocumentBinaryInputLoader | `nodes-langchain.documentBinaryInputLoader` | — | — |
| DocumentDefaultDataLoader | `nodes-langchain.documentDefaultDataLoader` | — | — |
| DocumentGithubLoader | `nodes-langchain.documentGithubLoader` | — | — |
| DocumentJsonInputLoader | `nodes-langchain.documentJsonInputLoader` | — | — |

## AI Embeddings (10)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| EmbeddingsAwsBedrock | `nodes-langchain.embeddingsAwsBedrock` | — | — |
| EmbeddingsAzureOpenAi | `nodes-langchain.embeddingsAzureOpenAi` | AzureOpenAiApi | — |
| EmbeddingsCohere | `nodes-langchain.embeddingsCohere` | CohereApi | — |
| EmbeddingsGoogleGemini | `nodes-langchain.embeddingsGoogleGemini` | GooglePalmApi | — |
| EmbeddingsGoogleVertex | `nodes-langchain.embeddingsGoogleVertex` | — | — |
| EmbeddingsHuggingFaceInference | `nodes-langchain.embeddingsHuggingFaceInference` | HuggingFaceApi | — |
| EmbeddingsLemonade | `nodes-langchain.embeddingsLemonade` | LemonadeApi | — |
| EmbeddingsMistralCloud | `nodes-langchain.embeddingsMistralCloud` | MistralCloudApi | — |
| EmbeddingsOllama | `nodes-langchain.embeddingsOllama` | OllamaApi | — |
| EmbeddingsOpenAi | `nodes-langchain.embeddingsOpenAi` | — | — |

## AI MCP (2)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| McpClient | `nodes-langchain.mcpClient` | McpOAuth2Api | — |
| McpClientTool | `nodes-langchain.mcpClientTool` | McpOAuth2Api | — |

## AI Memory (9)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| MemoryBufferWindow | `nodes-langchain.memoryBufferWindow` | — | — |
| MemoryChatRetriever | `nodes-langchain.memoryChatRetriever` | — | — |
| MemoryManager | `nodes-langchain.memoryManager` | — | — |
| MemoryMongoDbChat | `nodes-langchain.memoryMongoDbChat` | — | — |
| MemoryMotorhead | `nodes-langchain.memoryMotorhead` | MotorheadApi | — |
| MemoryPostgresChat | `nodes-langchain.memoryPostgresChat` | — | — |
| MemoryRedisChat | `nodes-langchain.memoryRedisChat` | — | — |
| MemoryXata | `nodes-langchain.memoryXata` | XataApi | — |
| MemoryZep | `nodes-langchain.memoryZep` | ZepApi | — |

## AI Models (25)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Anthropic | `nodes-langchain.anthropic` | AnthropicApi | — |
| GoogleGemini | `nodes-langchain.googleGemini` | GooglePalmApi | — |
| LmChatAnthropic | `nodes-langchain.lmChatAnthropic` | AnthropicApi | — |
| LmChatAwsBedrock | `nodes-langchain.lmChatAwsBedrock` | — | — |
| LmChatAzureOpenAi | `nodes-langchain.lmChatAzureOpenAi` | AzureOpenAiApi, AzureEntraCognitiveServicesOAuth2Api | — |
| LmChatCohere | `nodes-langchain.lmChatCohere` | CohereApi | — |
| LmChatDeepSeek | `nodes-langchain.lmChatDeepSeek` | DeepSeekApi | — |
| LmChatGoogleGemini | `nodes-langchain.lmChatGoogleGemini` | GooglePalmApi | — |
| LmChatGoogleVertex | `nodes-langchain.lmChatGoogleVertex` | — | — |
| LmChatGroq | `nodes-langchain.lmChatGroq` | GroqApi | — |
| LmChatLemonade | `nodes-langchain.lmChatLemonade` | LemonadeApi | — |
| LmChatMistralCloud | `nodes-langchain.lmChatMistralCloud` | MistralCloudApi | — |
| LmChatOllama | `nodes-langchain.lmChatOllama` | OllamaApi | — |
| LmChatOpenAi | `nodes-langchain.lmChatOpenAi` | — | — |
| LmChatOpenRouter | `nodes-langchain.lmChatOpenRouter` | OpenRouterApi | — |
| LmChatVercelAiGateway | `nodes-langchain.lmChatVercelAiGateway` | VercelAiGatewayApi | — |
| LmChatXAiGrok | `nodes-langchain.lmChatXAiGrok` | XAiApi | — |
| LmCohere | `nodes-langchain.lmCohere` | CohereApi | — |
| LmLemonade | `nodes-langchain.lmLemonade` | LemonadeApi | — |
| LmOllama | `nodes-langchain.lmOllama` | OllamaApi | — |
| LmOpenAi | `nodes-langchain.lmOpenAi` | — | — |
| LmOpenHuggingFaceInference | `nodes-langchain.lmOpenHuggingFaceInference` | HuggingFaceApi | — |
| ModelSelector | `nodes-langchain.modelSelector` | — | — |
| Ollama | `nodes-langchain.ollama` | OllamaApi | — |
| OpenAi | `nodes-langchain.openAi` | OpenAiApi | — |

## AI Output Parsers (3)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| OutputParserAutofixing | `nodes-langchain.outputParserAutofixing` | — | — |
| OutputParserItemList | `nodes-langchain.outputParserItemList` | — | — |
| OutputParserStructured | `nodes-langchain.outputParserStructured` | — | — |

## AI Rerankers (1)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| RerankerCohere | `nodes-langchain.rerankerCohere` | CohereApi | — |

## AI Retrievers (4)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| RetrieverContextualCompression | `nodes-langchain.retrieverContextualCompression` | — | — |
| RetrieverMultiQuery | `nodes-langchain.retrieverMultiQuery` | — | — |
| RetrieverVectorStore | `nodes-langchain.retrieverVectorStore` | — | — |
| RetrieverWorkflow | `nodes-langchain.retrieverWorkflow` | — | — |

## AI Text Splitters (3)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| TextSplitterCharacterTextSplitter | `nodes-langchain.textSplitterCharacterTextSplitter` | — | — |
| TextSplitterRecursiveCharacterTextSplitter | `nodes-langchain.textSplitterRecursiveCharacterTextSplitter` | — | — |
| TextSplitterTokenSplitter | `nodes-langchain.textSplitterTokenSplitter` | — | — |

## AI Tools (13)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Code | `nodes-langchain.code` | — | — |
| Guardrails | `nodes-langchain.guardrails` | — | — |
| ToolCalculator | `nodes-langchain.toolCalculator` | — | — |
| ToolCode | `nodes-langchain.toolCode` | — | — |
| ToolExecutor | `nodes-langchain.toolExecutor` | — | — |
| ToolHttpRequest | `nodes-langchain.toolHttpRequest` | — | — |
| ToolSearXng | `nodes-langchain.toolSearXng` | SearXngApi | — |
| ToolSerpApi | `nodes-langchain.toolSerpApi` | SerpApi | — |
| ToolThink | `nodes-langchain.toolThink` | — | — |
| ToolVectorStore | `nodes-langchain.toolVectorStore` | — | — |
| ToolWikipedia | `nodes-langchain.toolWikipedia` | — | — |
| ToolWolframAlpha | `nodes-langchain.toolWolframAlpha` | WolframAlphaApi | — |
| ToolWorkflow | `nodes-langchain.toolWorkflow` | — | — |

## AI Triggers (4)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| Chat | `nodes-langchain.chat` | — | — |
| ChatTrigger | `nodes-langchain.chatTrigger` | — | — |
| ManualChatTrigger | `nodes-langchain.manualChatTrigger` | — | — |
| McpTrigger | `nodes-langchain.mcpTrigger` | — | — |

## AI Vector Stores (19)

| 节点 | nodeType | 凭证 | 文档 |
|------|----------|------|------|
| VectorStoreAzureAISearch | `nodes-langchain.vectorStoreAzureAISearch` | AzureAiSearchApi | — |
| VectorStoreInMemory | `nodes-langchain.vectorStoreInMemory` | — | — |
| VectorStoreInMemoryInsert | `nodes-langchain.vectorStoreInMemoryInsert` | — | — |
| VectorStoreInMemoryLoad | `nodes-langchain.vectorStoreInMemoryLoad` | — | — |
| VectorStoreMilvus | `nodes-langchain.vectorStoreMilvus` | MilvusApi | — |
| VectorStoreMongoDBAtlas | `nodes-langchain.vectorStoreMongoDBAtlas` | — | — |
| VectorStorePGVector | `nodes-langchain.vectorStorePGVector` | — | — |
| VectorStorePinecone | `nodes-langchain.vectorStorePinecone` | PineconeApi | — |
| VectorStorePineconeInsert | `nodes-langchain.vectorStorePineconeInsert` | PineconeApi | — |
| VectorStorePineconeLoad | `nodes-langchain.vectorStorePineconeLoad` | PineconeApi | — |
| VectorStoreQdrant | `nodes-langchain.vectorStoreQdrant` | QdrantApi | — |
| VectorStoreRedis | `nodes-langchain.vectorStoreRedis` | — | — |
| VectorStoreSupabase | `nodes-langchain.vectorStoreSupabase` | — | — |
| VectorStoreSupabaseInsert | `nodes-langchain.vectorStoreSupabaseInsert` | — | — |
| VectorStoreSupabaseLoad | `nodes-langchain.vectorStoreSupabaseLoad` | — | — |
| VectorStoreWeaviate | `nodes-langchain.vectorStoreWeaviate` | WeaviateApi | — |
| VectorStoreZep | `nodes-langchain.vectorStoreZep` | ZepApi | — |
| VectorStoreZepInsert | `nodes-langchain.vectorStoreZepInsert` | ZepApi | — |
| VectorStoreZepLoad | `nodes-langchain.vectorStoreZepLoad` | ZepApi | — |

