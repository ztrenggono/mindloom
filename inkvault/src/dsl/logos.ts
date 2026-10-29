/**
 * Tech logos for `icon: ...` in diagram code and the icon picker, from Simple Icons (CC0).
 * Named imports keep the bundle to just these logos.
 */
import {
  siAmazonapigateway, siAmazoncloudwatch, siAmazondynamodb, siAmazonec2, siAmazonrds, siAmazons3, siAmazonsqs, siAmazonwebservices,
  siAndroid, siAngular, siAnsible, siApacheairflow, siApachecassandra, siApachekafka, siApachespark, siApple, siArgo, siAuth0, siAwslambda,
  siBitbucket, siBun, siCelery, siCircleci, siClickhouse, siCloudflare, siConsul, siDatadog, siDbt, siDeno, siDigitalocean, siDjango, siDocker,
  siElasticsearch, siEnvoyproxy, siFastapi, siFigma, siFirebase, siFlutter, siGit, siGithub, siGithubactions, siGitlab, siGmail, siGo,
  siGooglebigquery, siGooglecloud, siGooglecloudstorage, siGrafana, siGraphql, siHashicorp, siHasura, siHelm, siHeroku, siIstio, siJaeger,
  siJavascript, siJenkins, siJfrog, siJira, siKeycloak, siKibana, siKong, siKubernetes, siLaravel, siLinux, siLogstash, siMariadb, siMetabase,
  siMinio, siMongodb, siMysql, siNeo4j, siNetlify, siNextdotjs, siNginx, siNodedotjs, siNotion, siOkta, siOpenai, siOpenjdk, siOpentelemetry,
  siPagerduty, siPaypal, siPhp, siPostgresql, siPostman, siPrisma, siPrometheus, siPython, siRabbitmq, siReact, siRedis, siRender, siRust,
  siSendgrid, siSentry, siShopify, siSlack, siSnowflake, siSonarqube, siSplunk, siSpring, siSqlite, siStripe, siSupabase, siSwagger,
  siTailscale, siTelegram, siTerraform, siTraefikproxy, siTwilio, siTypescript, siUbuntu, siVault, siVercel, siVite, siVmware, siVuedotjs,
  siWhatsapp, siWordpress,
} from 'simple-icons'

export interface Logo {
  title: string
  slug: string
  hex: string
  path: string
}

const LIST: Logo[] = [
  siAmazonapigateway, siAmazoncloudwatch, siAmazondynamodb, siAmazonec2, siAmazonrds, siAmazons3, siAmazonsqs, siAmazonwebservices,
  siAndroid, siAngular, siAnsible, siApacheairflow, siApachecassandra, siApachekafka, siApachespark, siApple, siArgo, siAuth0, siAwslambda,
  siBitbucket, siBun, siCelery, siCircleci, siClickhouse, siCloudflare, siConsul, siDatadog, siDbt, siDeno, siDigitalocean, siDjango, siDocker,
  siElasticsearch, siEnvoyproxy, siFastapi, siFigma, siFirebase, siFlutter, siGit, siGithub, siGithubactions, siGitlab, siGmail, siGo,
  siGooglebigquery, siGooglecloud, siGooglecloudstorage, siGrafana, siGraphql, siHashicorp, siHasura, siHelm, siHeroku, siIstio, siJaeger,
  siJavascript, siJenkins, siJfrog, siJira, siKeycloak, siKibana, siKong, siKubernetes, siLaravel, siLinux, siLogstash, siMariadb, siMetabase,
  siMinio, siMongodb, siMysql, siNeo4j, siNetlify, siNextdotjs, siNginx, siNodedotjs, siNotion, siOkta, siOpenai, siOpenjdk, siOpentelemetry,
  siPagerduty, siPaypal, siPhp, siPostgresql, siPostman, siPrisma, siPrometheus, siPython, siRabbitmq, siReact, siRedis, siRender, siRust,
  siSendgrid, siSentry, siShopify, siSlack, siSnowflake, siSonarqube, siSplunk, siSpring, siSqlite, siStripe, siSupabase, siSwagger,
  siTailscale, siTelegram, siTerraform, siTraefikproxy, siTwilio, siTypescript, siUbuntu, siVault, siVercel, siVite, siVmware, siVuedotjs,
  siWhatsapp, siWordpress,
]

/** Short names people actually type, following Eraser's icon names where they exist. */
const ALIASES: Record<string, string> = {
  postgres: 'postgresql',
  k8s: 'kubernetes',
  kafka: 'apachekafka',
  spark: 'apachespark',
  cassandra: 'apachecassandra',
  airflow: 'apacheairflow',
  node: 'nodedotjs',
  nodejs: 'nodedotjs',
  nextjs: 'nextdotjs',
  vue: 'vuedotjs',
  golang: 'go',
  java: 'openjdk',
  gcp: 'googlecloud',
  'gcp-bigquery': 'googlebigquery',
  bigquery: 'googlebigquery',
  'gcp-storage': 'googlecloudstorage',
  aws: 'amazonwebservices',
  'aws-s3': 'amazons3',
  s3: 'amazons3',
  'aws-ec2': 'amazonec2',
  ec2: 'amazonec2',
  'aws-lambda': 'awslambda',
  lambda: 'awslambda',
  'aws-rds': 'amazonrds',
  rds: 'amazonrds',
  'aws-sqs': 'amazonsqs',
  sqs: 'amazonsqs',
  'aws-dynamodb': 'amazondynamodb',
  dynamodb: 'amazondynamodb',
  'aws-api-gateway': 'amazonapigateway',
  'aws-cloudwatch': 'amazoncloudwatch',
  traefik: 'traefikproxy',
  envoy: 'envoyproxy',
  elastic: 'elasticsearch',
}

const BY_SLUG = new Map(LIST.map((l) => [l.slug, l]))

export const LOGOS = [...LIST].sort((a, b) => a.title.localeCompare(b.title))

export function logoFor(name?: string): Logo | null {
  if (!name) return null
  const key = name.toLowerCase().trim()
  return BY_SLUG.get(ALIASES[key] ?? key) ?? BY_SLUG.get(key.replace(/[\s_-]/g, '')) ?? null
}

/** Brand colour, or the text colour for near-black brands that would vanish on a dark canvas. */
export function logoColor(l: Logo, fallback = 'var(--d-text)') {
  const n = parseInt(l.hex, 16)
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  return lum < 0.2 ? fallback : `#${l.hex}`
}

/** The name to write in code, e.g. `icon: postgresql`. */
export const logoName = (l: Logo) => l.slug
