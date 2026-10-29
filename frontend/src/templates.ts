/** Starter diagrams drawn from common real-world IT systems, grouped for the insert panel. */
import type { DiagramType } from './types'

export interface Template {
  id: string
  category: string
  title: string
  description: string
  type: DiagramType
  code: string
}

export interface TemplateCategory {
  id: string
  label: string
  description: string
  icon: string
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: 'database', label: 'Database Design', description: 'ERDs for common product schemas', icon: 'database' },
  { id: 'api', label: 'API & Auth Flows', description: 'Sequence diagrams for requests and callbacks', icon: 'arrow-left-right' },
  { id: 'cloud', label: 'Cloud Architecture', description: 'Infrastructure on AWS, GCP and Kubernetes', icon: 'cloud' },
  { id: 'devops', label: 'DevOps & Reliability', description: 'Pipelines, releases and incident runbooks', icon: 'git-branch' },
  { id: 'product', label: 'Product & Operations', description: 'Business processes and user journeys', icon: 'workflow' },
  { id: 'ai', label: 'AI & Data', description: 'RAG, ML pipelines, agents and experiments', icon: 'sparkles' },
  { id: 'security', label: 'Security & Access', description: 'SSO, RBAC, zero trust and secrets', icon: 'shield' },
  { id: 'mobile', label: 'Mobile', description: 'Push, offline sync and app releases', icon: 'smartphone' },
]

export const TEMPLATES: Template[] = [
  /* ---------------------------------- Database Design ---------------------------------- */
  {
    id: 'erd-ecommerce',
    category: 'database',
    title: 'E-commerce Orders & Payments',
    description: 'Customers, carts, orders, payments and shipments',
    type: 'erd',
    code: `title E-commerce Orders & Payments

customers [icon: user, color: blue] {
  id uuid pk
  email varchar unique
  full_name varchar
  created_at timestamp
}

addresses [icon: map-pin, color: blue] {
  id uuid pk
  customer_id uuid fk
  city varchar
  postal_code varchar
}

products [icon: package, color: green] {
  id uuid pk
  sku varchar unique
  name varchar
  price_cents int
  stock int
}

orders [icon: shopping-cart, color: orange] {
  id uuid pk
  customer_id uuid fk
  address_id uuid fk
  status varchar
  total_cents int
  placed_at timestamp
}

order_items [icon: list, color: orange] {
  order_id uuid pk fk
  product_id uuid pk fk
  quantity int
  unit_price_cents int
}

payments [icon: credit-card, color: purple] {
  id uuid pk
  order_id uuid fk
  provider varchar
  status varchar
  paid_at timestamp
}

shipments [icon: truck, color: teal] {
  id uuid pk
  order_id uuid fk
  courier varchar
  tracking_no varchar
}

addresses.customer_id > customers.id
orders.customer_id > customers.id
orders.address_id > addresses.id
order_items.order_id > orders.id
order_items.product_id > products.id
payments.order_id > orders.id
shipments.order_id - orders.id`,
  },
  {
    id: 'erd-saas-billing',
    category: 'database',
    title: 'SaaS Multi-tenant Billing',
    description: 'Workspaces, members, plans, subscriptions and invoices',
    type: 'erd',
    code: `title SaaS Multi-tenant Billing

workspaces [icon: building-2, color: blue] {
  id uuid pk
  name varchar
  slug varchar unique
  created_at timestamp
}

users [icon: user, color: blue] {
  id uuid pk
  email varchar unique
  name varchar
}

memberships [icon: users, color: teal] {
  workspace_id uuid pk fk
  user_id uuid pk fk
  role varchar
}

plans [icon: layers, color: green] {
  id varchar pk
  name varchar
  price_cents int
  seat_limit int
}

subscriptions [icon: repeat, color: purple] {
  id uuid pk
  workspace_id uuid fk
  plan_id varchar fk
  status varchar
  current_period_end timestamp
}

invoices [icon: receipt, color: orange] {
  id uuid pk
  subscription_id uuid fk
  amount_cents int
  status varchar
  issued_at timestamp
}

memberships.workspace_id > workspaces.id
memberships.user_id > users.id
subscriptions.workspace_id - workspaces.id
subscriptions.plan_id > plans.id
invoices.subscription_id > subscriptions.id`,
  },
  {
    id: 'erd-social',
    category: 'database',
    title: 'Social Media Feed',
    description: 'Users, posts, comments, likes and follows',
    type: 'erd',
    code: `title Social Media Feed

users [icon: user, color: blue] {
  id bigint pk
  username varchar unique
  bio text
  created_at timestamp
}

follows [icon: user-plus, color: teal] {
  follower_id bigint pk fk
  followee_id bigint pk fk
  created_at timestamp
}

posts [icon: image, color: green] {
  id bigint pk
  author_id bigint fk
  caption text
  media_url varchar
  created_at timestamp
}

comments [icon: message-circle, color: orange] {
  id bigint pk
  post_id bigint fk
  author_id bigint fk
  body text
}

likes [icon: heart, color: red] {
  user_id bigint pk fk
  post_id bigint pk fk
}

follows.follower_id > users.id
follows.followee_id > users.id
posts.author_id > users.id
comments.post_id > posts.id
comments.author_id > users.id
likes.user_id > users.id
likes.post_id > posts.id`,
  },
  {
    id: 'erd-ride-hailing',
    category: 'database',
    title: 'Ride-hailing Trips',
    description: 'Riders, drivers, vehicles, trips and ratings',
    type: 'erd',
    code: `title Ride-hailing Trips

riders [icon: user, color: blue] {
  id uuid pk
  phone varchar unique
  name varchar
}

drivers [icon: id-card, color: green] {
  id uuid pk
  phone varchar unique
  license_no varchar
  status varchar
}

vehicles [icon: car, color: green] {
  id uuid pk
  driver_id uuid fk
  plate_no varchar unique
  type varchar
}

trips [icon: route, color: orange] {
  id uuid pk
  rider_id uuid fk
  driver_id uuid fk
  pickup_point geography
  dropoff_point geography
  fare_cents int
  status varchar
}

ratings [icon: star, color: yellow] {
  trip_id uuid pk fk
  score int
  comment text
}

vehicles.driver_id - drivers.id
trips.rider_id > riders.id
trips.driver_id > drivers.id
ratings.trip_id - trips.id`,
  },

  /* ---------------------------------- API & Auth Flows ---------------------------------- */
  {
    id: 'seq-oauth-pkce',
    category: 'api',
    title: 'OAuth 2.0 Login (PKCE) + JWT',
    description: 'SPA login through an identity provider, then API calls',
    type: 'sequence',
    code: `title OAuth 2.0 Login with PKCE
autoNumber on

User [icon: user, color: gray]
SPA [icon: react, color: blue]
Auth Server [icon: auth0, color: orange]
API [icon: server, color: green]

User > SPA: Click "Sign in"
SPA > Auth Server: /authorize + code_challenge
Auth Server > User: Login page
User > Auth Server: Credentials + MFA
Auth Server --> SPA: Redirect with auth code
SPA > Auth Server: /token + code_verifier
activate Auth Server
Auth Server --> SPA: access_token (JWT) + refresh_token
deactivate Auth Server
SPA > API: GET /me (Bearer JWT)
activate API
API > API: Verify signature and expiry
API --> SPA: 200 profile
deactivate API
alt [label: token expired] {
  SPA > Auth Server: /token (refresh_token)
  Auth Server --> SPA: New access_token
}`,
  },
  {
    id: 'seq-payment-webhook',
    category: 'api',
    title: 'Checkout with Payment Webhook',
    description: 'Create a payment intent, pay, confirm by webhook',
    type: 'sequence',
    code: `title Checkout with Payment Gateway Webhook
autoNumber on

Customer [icon: user, color: gray]
Web App [icon: nextdotjs, color: blue]
Order Service [icon: server, color: green]
Payment Gateway [icon: stripe, color: purple]
DB [icon: postgresql, color: blue]

Customer > Web App: Click "Pay"
Web App > Order Service: POST /orders
Order Service > DB: INSERT order (PENDING)
Order Service > Payment Gateway: Create payment intent
Payment Gateway --> Order Service: client_secret
Order Service --> Web App: client_secret
Web App > Payment Gateway: Confirm card (3DS)
Payment Gateway > Order Service: Webhook payment.succeeded
activate Order Service
Order Service > Order Service: Verify signature, idempotency key
alt [label: succeeded] {
  Order Service > DB: UPDATE order PAID
}
else [label: failed] {
  Order Service > DB: UPDATE order FAILED
}
Order Service --> Payment Gateway: 200 OK
deactivate Order Service
Web App > Order Service: Poll order status
Order Service --> Web App: PAID`,
  },
  {
    id: 'seq-presigned-upload',
    category: 'api',
    title: 'File Upload via Presigned URL',
    description: 'Browser uploads straight to S3, then a worker processes it',
    type: 'sequence',
    code: `title File Upload via S3 Presigned URL

Browser [icon: monitor, color: gray]
API [icon: server, color: green]
S3 [icon: aws-s3, color: orange]
Queue [icon: aws-sqs, color: pink]
Worker [icon: cpu, color: purple]

Browser > API: POST /uploads (name, size, type)
API > API: Validate quota and MIME type
API --> Browser: Presigned PUT URL (5 min)
Browser > S3: PUT file
S3 --> Browser: 200 ETag
S3 > Queue: ObjectCreated event
Queue > Worker: Message
activate Worker
Worker > S3: GET object
Worker > Worker: Scan virus, make thumbnail
Worker > API: Mark upload READY
deactivate Worker
Browser > API: GET /uploads/:id
API --> Browser: READY + CDN URL`,
  },

  /* --------------------------------- Cloud Architecture --------------------------------- */
  {
    id: 'cloud-aws-3tier',
    category: 'cloud',
    title: '3-tier Web App on AWS',
    description: 'CDN, load balancer, autoscaling app tier and RDS',
    type: 'cloud',
    code: `title 3-tier Web App on AWS
direction right

Users [icon: users]
CloudFront [icon: cloudflare]

AWS [icon: aws, color: orange] {
  Public Subnet [color: blue] {
    Load Balancer [icon: shuffle]
  }
  App Subnet [color: green] {
    App Server 1 [icon: aws-ec2]
    App Server 2 [icon: aws-ec2]
  }
  Data Subnet [color: purple] {
    Primary DB [icon: aws-rds]
    Cache [icon: redis]
  }
  Static Assets [icon: aws-s3]
}

Users > CloudFront
CloudFront > Load Balancer
CloudFront > Static Assets
Load Balancer > App Server 1, App Server 2
App Server 1 > Primary DB
App Server 2 > Primary DB
App Server 1 > Cache`,
  },
  {
    id: 'cloud-k8s-microservices',
    category: 'cloud',
    title: 'Microservices on Kubernetes',
    description: 'Ingress, services, message broker and observability',
    type: 'cloud',
    code: `title Microservices on Kubernetes
direction right

Client [icon: smartphone]

Cluster [icon: kubernetes, color: blue] {
  Ingress [icon: nginx]
  Services [color: green] {
    Auth Service [icon: go]
    Order Service [icon: nodedotjs]
    Catalog Service [icon: python]
  }
  Broker [icon: rabbitmq]
  Observability [color: gray] {
    Prometheus [icon: prometheus]
    Grafana [icon: grafana]
  }
}

Orders DB [icon: postgresql]
Catalog DB [icon: mongodb]

Client > Ingress
Ingress > Auth Service, Order Service, Catalog Service
Order Service > Broker: order.created
Broker > Catalog Service: reserve stock
Order Service > Orders DB
Catalog Service > Catalog DB
Prometheus > Grafana
Services --> Prometheus: metrics`,
  },
  {
    id: 'cloud-event-pipeline',
    category: 'cloud',
    title: 'Event-driven Data Pipeline',
    description: 'Clickstream through Kafka into a warehouse and dashboards',
    type: 'cloud',
    code: `title Event-driven Analytics Pipeline
direction right

Apps [color: blue] {
  Web [icon: react]
  Mobile [icon: android]
}

Ingest [color: orange] {
  Collector API [icon: server]
  Kafka [icon: kafka]
}

Processing [color: purple] {
  Stream Jobs [icon: spark]
  Orchestrator [icon: airflow]
}

Storage [color: green] {
  Data Lake [icon: aws-s3]
  Warehouse [icon: snowflake]
}

Dashboards [icon: metabase]

Web > Collector API
Mobile > Collector API
Collector API > Kafka: events
Kafka > Stream Jobs
Stream Jobs > Data Lake: parquet
Orchestrator > Warehouse: dbt models
Data Lake > Warehouse
Warehouse > Dashboards`,
  },

  /* -------------------------------- DevOps & Reliability -------------------------------- */
  {
    id: 'flow-cicd',
    category: 'devops',
    title: 'CI/CD Pipeline',
    description: 'GitHub Actions to Docker to Kubernetes with a staging gate',
    type: 'flowchart',
    code: `title CI/CD Pipeline
direction right

Push [shape: oval, icon: github, color: gray]
Lint and Test [icon: githubactions, color: blue]
Tests pass? [shape: diamond, icon: circle-help, color: yellow]
Build Image [icon: docker, color: blue]
Push Registry [icon: package, color: blue]
Deploy Staging [icon: kubernetes, color: green]
Smoke Tests [icon: flask-conical, color: green]
Approve? [shape: diamond, icon: user-check, color: yellow]
Deploy Production [icon: rocket, color: purple]
Notify Team [shape: oval, icon: slack, color: gray]

Push > Lint and Test > Tests pass?
Tests pass? > Build Image: yes
Tests pass? > Notify Team: no
Build Image > Push Registry > Deploy Staging > Smoke Tests > Approve?
Approve? > Deploy Production: yes
Approve? > Notify Team: no
Deploy Production > Notify Team`,
  },
  {
    id: 'flow-incident',
    category: 'devops',
    title: 'Incident Response Runbook',
    description: 'From alert to mitigation and postmortem',
    type: 'flowchart',
    code: `title Incident Response Runbook

Alert fires [shape: oval, icon: bell-ring, color: red]
Ack within 5 min [icon: pagerduty, color: orange]
Customer impact? [shape: diamond, icon: circle-help, color: yellow]
Open incident channel [icon: slack, color: blue]
Assign roles [icon: users, color: blue]
Mitigate [icon: wrench, color: green]
Rollback possible? [shape: diamond, icon: circle-help, color: yellow]
Roll back release [icon: undo-2, color: green]
Hotfix [icon: hammer, color: green]
Monitor recovery [icon: activity, color: teal]
Low priority ticket [icon: ticket, color: gray]
Postmortem [shape: oval, icon: file-text, color: purple]

Alert fires > Ack within 5 min > Customer impact?
Customer impact? > Open incident channel: yes
Customer impact? > Low priority ticket: no
Open incident channel > Assign roles > Mitigate > Rollback possible?
Rollback possible? > Roll back release: yes
Rollback possible? > Hotfix: no
Roll back release > Monitor recovery
Hotfix > Monitor recovery
Monitor recovery > Postmortem`,
  },
  {
    id: 'flow-release',
    category: 'devops',
    title: 'Git Branching & Release',
    description: 'Feature branches, review, release tag and hotfixes',
    type: 'flowchart',
    code: `title Git Branching & Release
direction right

Feature branch [shape: oval, icon: git-branch, color: blue]
Open PR [icon: git-pull-request, color: blue]
Review approved? [shape: diamond, icon: circle-help, color: yellow]
Merge to main [icon: git-merge, color: green]
Tag release [icon: tag, color: green]
Deploy [icon: rocket, color: purple]
Bug in prod? [shape: diamond, icon: circle-help, color: yellow]
Hotfix branch [icon: flame, color: red]
Done [shape: oval, icon: check, color: gray]

Feature branch > Open PR > Review approved?
Review approved? > Merge to main: yes
Review approved? --> Feature branch: changes requested
Merge to main > Tag release > Deploy > Bug in prod?
Bug in prod? > Hotfix branch: yes
Bug in prod? > Done: no
Hotfix branch > Merge to main`,
  },

  /* -------------------------------- Product & Operations -------------------------------- */
  {
    id: 'mind-product-roadmap',
    category: 'product',
    title: 'Product Roadmap Brainstorm',
    description: 'Mind map of themes, bets and metrics for a quarter',
    type: 'mindmap',
    code: `title Product Roadmap Brainstorm

Q3 Roadmap [icon: map]
  Growth [icon: trending-up]
    Referral program
    Self-serve trials
    Pricing page test
  Retention [icon: repeat]
    Onboarding checklist
    Weekly digest email
    In-app tips
  Platform [icon: server]
    Public API v2
    SSO for teams
    Audit log
  Metrics [icon: chart-line]
    Activation rate
    Net revenue retention
    Time to first value`,
  },
  {
    id: 'mind-incident-retro',
    category: 'devops',
    title: 'Incident Retrospective',
    description: 'Mind map of what happened, why, and follow-ups',
    type: 'mindmap',
    code: `title Incident Retrospective

Checkout outage [icon: siren, color: red]
  Timeline [icon: clock]
    Deploy at 14:02
    Alerts at 14:09
    Rollback at 14:31
  Root causes [icon: search]
    Missing DB index
    No canary for migrations
  Impact [icon: users]
    29 minutes of failed payments
    Support tickets spiked
  Follow-ups [icon: list-checks, color: green]
    Add migration canary
    Index review in CI
    Payment failure alert`,
  },
  {
    id: 'flow-onboarding',
    category: 'product',
    title: 'User Signup & Onboarding',
    description: 'Sign up, verify email, set up workspace, activate',
    type: 'flowchart',
    code: `title User Signup & Onboarding

Landing page [shape: oval, icon: globe, color: gray]
Sign up [icon: user-plus, color: blue]
Email verified? [shape: diamond, icon: mail-check, color: yellow]
Resend email [icon: mail, color: orange]
Create workspace [icon: building-2, color: blue]
Invite teammates [icon: users, color: green]
Import data [icon: upload, color: green]
First project created [icon: folder-plus, color: purple]
Activated [shape: oval, icon: party-popper, color: purple]

Landing page > Sign up > Email verified?
Email verified? > Create workspace: yes
Email verified? > Resend email: no
Resend email --> Email verified?
Create workspace > Invite teammates
Create workspace > Import data
Invite teammates > First project created
Import data > First project created
First project created > Activated`,
  },
  {
    id: 'flow-refund',
    category: 'product',
    title: 'Refund Request Approval',
    description: 'Support handles refunds with finance sign-off',
    type: 'flowchart',
    code: `title Refund Request Approval

Customer requests refund [shape: oval, icon: message-square, color: gray]
Within 14 days? [shape: diamond, icon: calendar, color: yellow]
Amount over limit? [shape: diamond, icon: circle-dollar-sign, color: yellow]
Agent approves [icon: user-check, color: blue]
Finance review [icon: landmark, color: purple]
Reject with reason [icon: x-circle, color: red]
Refund via gateway [icon: stripe, color: green]
Notify customer [shape: oval, icon: mail, color: gray]

Customer requests refund > Within 14 days?
Within 14 days? > Amount over limit?: yes
Within 14 days? > Reject with reason: no
Amount over limit? > Finance review: yes
Amount over limit? > Agent approves: no
Finance review > Refund via gateway: approved
Finance review > Reject with reason: denied
Agent approves > Refund via gateway
Refund via gateway > Notify customer
Reject with reason > Notify customer`,
  },
  {
    id: 'flow-feature-flag',
    category: 'product',
    title: 'Feature Flag Rollout',
    description: 'Internal, 5%, 50%, then everyone, with a kill switch',
    type: 'flowchart',
    code: `title Feature Flag Rollout
direction right

Ship behind flag [shape: oval, icon: flag, color: blue]
Internal users [icon: users, color: blue]
5 percent [icon: percent, color: green]
Metrics healthy? [shape: diamond, icon: activity, color: yellow]
50 percent [icon: percent, color: green]
Everyone [icon: globe, color: purple]
Kill switch [icon: power, color: red]
Remove flag [shape: oval, icon: trash-2, color: gray]

Ship behind flag > Internal users > 5 percent > Metrics healthy?
Metrics healthy? > 50 percent: yes
Metrics healthy? > Kill switch: no
50 percent > Everyone > Remove flag`,
  },

  /* ------------------------------- More: Database Design ------------------------------- */
  {
    id: 'erd-hospital',
    category: 'database',
    title: 'Hospital Appointments',
    description: 'Patients, doctors, schedules, appointments and prescriptions',
    type: 'erd',
    code: `title Hospital Appointments

patients [icon: user, color: blue] {
  id uuid pk
  medical_record_no varchar unique
  full_name varchar
  birth_date date
}

doctors [icon: stethoscope, color: green] {
  id uuid pk
  name varchar
  specialty varchar
}

schedules [icon: calendar, color: teal] {
  id uuid pk
  doctor_id uuid fk
  day_of_week int
  start_time time
  end_time time
}

appointments [icon: clipboard-list, color: orange] {
  id uuid pk
  patient_id uuid fk
  doctor_id uuid fk
  scheduled_at timestamp
  status varchar
}

prescriptions [icon: pill, color: purple] {
  id uuid pk
  appointment_id uuid fk
  drug_name varchar
  dosage varchar
}

schedules.doctor_id > doctors.id
appointments.patient_id > patients.id
appointments.doctor_id > doctors.id
prescriptions.appointment_id > appointments.id`,
  },
  {
    id: 'erd-lms',
    category: 'database',
    title: 'Online Course Platform (LMS)',
    description: 'Courses, lessons, enrollments, progress and certificates',
    type: 'erd',
    code: `title Online Course Platform

students [icon: graduation-cap, color: blue] {
  id uuid pk
  email varchar unique
  name varchar
}

instructors [icon: presentation, color: green] {
  id uuid pk
  name varchar
  bio text
}

courses [icon: book-open, color: purple] {
  id uuid pk
  instructor_id uuid fk
  title varchar
  price_cents int
  published boolean
}

lessons [icon: play-circle, color: purple] {
  id uuid pk
  course_id uuid fk
  position int
  video_url varchar
}

enrollments [icon: ticket, color: orange] {
  student_id uuid pk fk
  course_id uuid pk fk
  enrolled_at timestamp
}

lesson_progress [icon: circle-check, color: teal] {
  student_id uuid pk fk
  lesson_id uuid pk fk
  completed_at timestamp
}

certificates [icon: award, color: yellow] {
  id uuid pk
  student_id uuid fk
  course_id uuid fk
  issued_at timestamp
}

courses.instructor_id > instructors.id
lessons.course_id > courses.id
enrollments.student_id > students.id
enrollments.course_id > courses.id
lesson_progress.student_id > students.id
lesson_progress.lesson_id > lessons.id
certificates.student_id > students.id
certificates.course_id > courses.id`,
  },
  {
    id: 'erd-inventory',
    category: 'database',
    title: 'Inventory & Warehouse',
    description: 'Warehouses, stock levels, purchase orders and movements',
    type: 'erd',
    code: `title Inventory & Warehouse

warehouses [icon: warehouse, color: blue] {
  id uuid pk
  code varchar unique
  city varchar
}

suppliers [icon: factory, color: gray] {
  id uuid pk
  name varchar
  contact_email varchar
}

products [icon: package, color: green] {
  id uuid pk
  sku varchar unique
  name varchar
  reorder_point int
}

stock_levels [icon: boxes, color: teal] {
  warehouse_id uuid pk fk
  product_id uuid pk fk
  on_hand int
  reserved int
}

purchase_orders [icon: file-text, color: orange] {
  id uuid pk
  supplier_id uuid fk
  warehouse_id uuid fk
  status varchar
  expected_at date
}

stock_movements [icon: arrow-left-right, color: purple] {
  id bigint pk
  warehouse_id uuid fk
  product_id uuid fk
  quantity int
  reason varchar
  moved_at timestamp
}

stock_levels.warehouse_id > warehouses.id
stock_levels.product_id > products.id
purchase_orders.supplier_id > suppliers.id
purchase_orders.warehouse_id > warehouses.id
stock_movements.warehouse_id > warehouses.id
stock_movements.product_id > products.id`,
  },
  {
    id: 'erd-event-booking',
    category: 'database',
    title: 'Event Ticket Booking',
    description: 'Venues, events, seats, bookings and tickets',
    type: 'erd',
    code: `title Event Ticket Booking

venues [icon: map-pin, color: blue] {
  id uuid pk
  name varchar
  capacity int
}

events [icon: calendar-days, color: purple] {
  id uuid pk
  venue_id uuid fk
  name varchar
  starts_at timestamp
}

seats [icon: armchair, color: teal] {
  id uuid pk
  venue_id uuid fk
  section varchar
  row_label varchar
  number int
}

bookings [icon: shopping-cart, color: orange] {
  id uuid pk
  event_id uuid fk
  customer_email varchar
  status varchar
  hold_expires_at timestamp
}

tickets [icon: ticket, color: green] {
  id uuid pk
  booking_id uuid fk
  seat_id uuid fk
  qr_code varchar unique
}

events.venue_id > venues.id
seats.venue_id > venues.id
bookings.event_id > events.id
tickets.booking_id > bookings.id
tickets.seat_id > seats.id`,
  },
  {
    id: 'erd-ledger',
    category: 'database',
    title: 'Banking Double-entry Ledger',
    description: 'Accounts, journal entries and balanced postings',
    type: 'erd',
    code: `title Double-entry Ledger

customers [icon: user, color: blue] {
  id uuid pk
  name varchar
  kyc_status varchar
}

accounts [icon: wallet, color: green] {
  id uuid pk
  customer_id uuid fk
  currency char
  type varchar
  balance_cents bigint
}

journal_entries [icon: book, color: purple] {
  id uuid pk
  reference varchar unique
  description varchar
  posted_at timestamp
}

postings [icon: arrow-left-right, color: orange] {
  id bigint pk
  entry_id uuid fk
  account_id uuid fk
  amount_cents bigint
  direction varchar
}

accounts.customer_id > customers.id
postings.entry_id > journal_entries.id
postings.account_id > accounts.id`,
  },

  /* ------------------------------- More: API & Auth Flows ------------------------------- */
  {
    id: 'seq-cache-aside',
    category: 'api',
    title: 'Cache-aside Read',
    description: 'Read through Redis, fall back to the database on a miss',
    type: 'sequence',
    code: `title Cache-aside Read

Client [icon: monitor, color: gray]
API [icon: server, color: green]
Cache [icon: redis, color: red]
DB [icon: postgresql, color: blue]

Client > API: GET /products/42
API > Cache: GET product:42
alt [label: cache hit] {
  Cache --> API: cached JSON
}
else [label: cache miss] {
  Cache --> API: nil
  API > DB: SELECT product 42
  DB --> API: row
  API > Cache: SET product:42 EX 300
}
API --> Client: 200 product`,
  },
  {
    id: 'seq-saga',
    category: 'api',
    title: 'Order Saga with Compensation',
    description: 'Orchestrated saga across order, payment and inventory',
    type: 'sequence',
    code: `title Order Saga (Orchestration)
autoNumber on

Orchestrator [icon: workflow, color: purple]
Order Service [icon: shopping-cart, color: orange]
Payment Service [icon: credit-card, color: green]
Inventory Service [icon: boxes, color: blue]

Orchestrator > Order Service: Create order PENDING
Orchestrator > Payment Service: Charge customer
Payment Service --> Orchestrator: Charged
Orchestrator > Inventory Service: Reserve items
alt [label: reserved] {
  Inventory Service --> Orchestrator: Reserved
  Orchestrator > Order Service: Mark CONFIRMED
}
else [label: out of stock] {
  Inventory Service --> Orchestrator: Failed
  Orchestrator > Payment Service: Refund charge
  Orchestrator > Order Service: Mark CANCELLED
}`,
  },
  {
    id: 'seq-websocket-chat',
    category: 'api',
    title: 'Realtime Chat over WebSocket',
    description: 'Connect, publish through Redis pub/sub, fan out to clients',
    type: 'sequence',
    code: `title Realtime Chat over WebSocket

Alice [icon: user, color: blue]
Bob [icon: user, color: green]
Gateway [icon: radio, color: purple]
PubSub [icon: redis, color: red]
Messages DB [icon: mongodb, color: green]

Alice > Gateway: WS connect + JWT
Bob > Gateway: WS connect + JWT
Gateway > PubSub: SUBSCRIBE room:7
Alice > Gateway: send "hi" to room 7
activate Gateway
Gateway > Messages DB: insert message
Gateway > PubSub: PUBLISH room:7
deactivate Gateway
PubSub --> Gateway: message
Gateway --> Bob: push "hi"
Gateway --> Alice: delivered ack`,
  },
  {
    id: 'seq-password-reset',
    category: 'api',
    title: 'Password Reset by Email',
    description: 'Single-use, expiring token sent by email',
    type: 'sequence',
    code: `title Password Reset by Email

User [icon: user, color: gray]
Web App [icon: globe, color: blue]
Auth API [icon: shield, color: green]
DB [icon: postgresql, color: blue]
Mailer [icon: sendgrid, color: purple]

User > Web App: Forgot password
Web App > Auth API: POST /password/forgot
Auth API > DB: Store hashed token, expires in 30 min
Auth API > Mailer: Send reset link
Auth API --> Web App: 202 (same reply if email unknown)
Mailer --> User: Email with link
User > Web App: Open link, new password
Web App > Auth API: POST /password/reset
Auth API > DB: Check token hash and expiry
alt [label: valid] {
  Auth API > DB: Update password, revoke sessions
  Auth API --> Web App: 200
}
else [label: expired or used] {
  Auth API --> Web App: 400
}`,
  },

  /* ----------------------------- More: Cloud Architecture ----------------------------- */
  {
    id: 'cloud-gcp-serverless',
    category: 'cloud',
    title: 'Serverless on Google Cloud',
    description: 'Cloud Run APIs, Pub/Sub workers and BigQuery analytics',
    type: 'cloud',
    code: `title Serverless on Google Cloud
direction right

Users [icon: users]

GCP [icon: gcp, color: blue] {
  Load Balancer [icon: shuffle]
  Cloud Run API [icon: server]
  Pub Sub [icon: radio]
  Worker [icon: cpu]
  Firestore [icon: firebase]
  Cloud Storage [icon: gcp-storage]
  BigQuery [icon: bigquery]
}

Users > Load Balancer > Cloud Run API
Cloud Run API > Firestore
Cloud Run API > Pub Sub: events
Pub Sub > Worker
Worker > Cloud Storage: exports
Worker > BigQuery: rows`,
  },
  {
    id: 'cloud-multi-region-dr',
    category: 'cloud',
    title: 'Multi-region Disaster Recovery',
    description: 'Active-passive regions with DNS failover and replicas',
    type: 'cloud',
    code: `title Multi-region Disaster Recovery
direction right

Users [icon: users]
DNS Failover [icon: globe]

Primary Region [icon: aws, color: green] {
  Primary LB [icon: shuffle]
  Primary App [icon: aws-ec2]
  Primary DB [icon: aws-rds]
}

Standby Region [icon: aws, color: gray] {
  Standby LB [icon: shuffle]
  Standby App [icon: aws-ec2]
  Replica DB [icon: aws-rds]
}

Backups [icon: aws-s3]

Users > DNS Failover
DNS Failover > Primary LB: healthy
DNS Failover --> Standby LB: on failure
Primary LB > Primary App > Primary DB
Standby LB > Standby App > Replica DB
Primary DB --> Replica DB: async replication
Primary DB > Backups: snapshots`,
  },
  {
    id: 'cloud-jamstack',
    category: 'cloud',
    title: 'JAMstack Website',
    description: 'Static site on a CDN with headless CMS and serverless forms',
    type: 'cloud',
    code: `title JAMstack Website
direction right

Editors [icon: pencil]
Visitors [icon: users]

Build [color: blue] {
  Git Repo [icon: github]
  CI Build [icon: githubactions]
}

Edge [color: purple] {
  CDN [icon: vercel]
  Serverless Forms [icon: zap]
}

Headless CMS [icon: wordpress]
Email [icon: sendgrid]

Editors > Headless CMS
Headless CMS > CI Build: publish webhook
Git Repo > CI Build
CI Build > CDN: static pages
Visitors > CDN
Visitors > Serverless Forms
Serverless Forms > Email`,
  },

  /* ---------------------------- More: DevOps & Reliability ---------------------------- */
  {
    id: 'flow-blue-green',
    category: 'devops',
    title: 'Blue-green Deployment',
    description: 'Deploy to idle color, verify, switch traffic, keep rollback',
    type: 'flowchart',
    code: `title Blue-green Deployment
direction right

New release [shape: oval, icon: package, color: gray]
Deploy to green [icon: server, color: green]
Health checks pass? [shape: diamond, icon: activity, color: yellow]
Switch router to green [icon: shuffle, color: blue]
Watch error rate [icon: chart-line, color: teal]
Errors spike? [shape: diamond, icon: triangle-alert, color: yellow]
Switch back to blue [icon: undo-2, color: red]
Keep blue as standby [shape: oval, icon: check, color: gray]
Fix and redeploy [icon: wrench, color: orange]

New release > Deploy to green > Health checks pass?
Health checks pass? > Switch router to green: yes
Health checks pass? > Fix and redeploy: no
Switch router to green > Watch error rate > Errors spike?
Errors spike? > Switch back to blue: yes
Errors spike? > Keep blue as standby: no
Switch back to blue > Fix and redeploy`,
  },
  {
    id: 'flow-db-migration',
    category: 'devops',
    title: 'Zero-downtime Schema Migration',
    description: 'Expand, backfill, switch reads, then contract',
    type: 'flowchart',
    code: `title Zero-downtime Schema Migration

Plan change [shape: oval, icon: clipboard-list, color: gray]
Add new column [icon: database, color: blue]
Dual write old and new [icon: copy, color: blue]
Backfill in batches [icon: layers, color: teal]
Data matches? [shape: diamond, icon: circle-help, color: yellow]
Fix backfill [icon: wrench, color: orange]
Switch reads to new [icon: arrow-right-left, color: green]
Stop writing old [icon: pen-off, color: green]
Drop old column [shape: oval, icon: trash-2, color: purple]

Plan change > Add new column > Dual write old and new > Backfill in batches > Data matches?
Data matches? > Switch reads to new: yes
Data matches? > Fix backfill: no
Fix backfill > Backfill in batches
Switch reads to new > Stop writing old > Drop old column`,
  },
  {
    id: 'flow-terraform',
    category: 'devops',
    title: 'Infrastructure Change with Terraform',
    description: 'Plan in PR, review, apply from CI, detect drift',
    type: 'flowchart',
    code: `title Infrastructure Change with Terraform
direction right

Edit .tf files [shape: oval, icon: terraform, color: purple]
Open PR [icon: git-pull-request, color: blue]
CI runs plan [icon: githubactions, color: blue]
Plan looks safe? [shape: diamond, icon: circle-help, color: yellow]
Request changes [icon: message-square, color: orange]
Merge [icon: git-merge, color: green]
CI runs apply [icon: play, color: green]
Nightly drift check [icon: clock, color: teal]
Drift found? [shape: diamond, icon: triangle-alert, color: yellow]
Alert owners [shape: oval, icon: bell-ring, color: red]
All good [shape: oval, icon: check, color: gray]

Edit .tf files > Open PR > CI runs plan > Plan looks safe?
Plan looks safe? > Merge: yes
Plan looks safe? > Request changes: no
Request changes --> Edit .tf files
Merge > CI runs apply > Nightly drift check > Drift found?
Drift found? > Alert owners: yes
Drift found? > All good: no`,
  },

  /* ---------------------------- More: Product & Operations ---------------------------- */
  {
    id: 'flow-checkout-funnel',
    category: 'product',
    title: 'E-commerce Checkout Funnel',
    description: 'Cart to paid order, with drop-off recovery',
    type: 'flowchart',
    code: `title E-commerce Checkout Funnel
direction right

View product [shape: oval, icon: eye, color: gray]
Add to cart [icon: shopping-cart, color: blue]
Logged in? [shape: diamond, icon: circle-help, color: yellow]
Guest checkout [icon: user, color: blue]
Shipping details [icon: truck, color: blue]
Pay [icon: credit-card, color: green]
Payment ok? [shape: diamond, icon: circle-help, color: yellow]
Order confirmed [shape: oval, icon: party-popper, color: purple]
Retry or other method [icon: refresh-cw, color: orange]
Abandoned cart email [icon: mail, color: red]

View product > Add to cart > Logged in?
Logged in? > Shipping details: yes
Logged in? > Guest checkout: no
Guest checkout > Shipping details > Pay > Payment ok?
Payment ok? > Order confirmed: yes
Payment ok? > Retry or other method: no
Retry or other method > Pay
Add to cart --> Abandoned cart email: no checkout in 24h`,
  },
  {
    id: 'flow-kyc',
    category: 'product',
    title: 'KYC Identity Verification',
    description: 'ID upload, liveness check, risk screening and review',
    type: 'flowchart',
    code: `title KYC Identity Verification

Start verification [shape: oval, icon: id-card, color: gray]
Upload ID document [icon: upload, color: blue]
OCR and checks [icon: scan-line, color: blue]
Selfie liveness [icon: camera, color: blue]
Face matches ID? [shape: diamond, icon: circle-help, color: yellow]
Sanctions screening [icon: shield-alert, color: purple]
Risk high? [shape: diamond, icon: circle-help, color: yellow]
Manual review [icon: user-search, color: orange]
Approved [shape: oval, icon: badge-check, color: green]
Rejected [shape: oval, icon: x-circle, color: red]

Start verification > Upload ID document > OCR and checks > Selfie liveness > Face matches ID?
Face matches ID? > Sanctions screening: yes
Face matches ID? > Rejected: no
Sanctions screening > Risk high?
Risk high? > Manual review: yes
Risk high? > Approved: no
Manual review > Approved: clear
Manual review > Rejected: confirmed risk`,
  },
  {
    id: 'flow-hiring',
    category: 'product',
    title: 'Engineering Hiring Pipeline',
    description: 'Application to offer with structured interviews',
    type: 'flowchart',
    code: `title Engineering Hiring Pipeline
direction right

Application [shape: oval, icon: file-text, color: gray]
Recruiter screen [icon: phone, color: blue]
Fit? [shape: diamond, icon: circle-help, color: yellow]
Technical interview [icon: code, color: blue]
System design [icon: network, color: blue]
Team interview [icon: users, color: blue]
Debrief [icon: messages-square, color: purple]
Hire? [shape: diamond, icon: circle-help, color: yellow]
Offer [shape: oval, icon: handshake, color: green]
Polite rejection [shape: oval, icon: mail, color: red]

Application > Recruiter screen > Fit?
Fit? > Technical interview: yes
Fit? > Polite rejection: no
Technical interview > System design > Team interview > Debrief > Hire?
Hire? > Offer: yes
Hire? > Polite rejection: no`,
  },

  /* ------------------------------------- AI & Data ------------------------------------- */
  {
    id: 'cloud-rag',
    category: 'ai',
    title: 'RAG Chatbot',
    description: 'Ingest documents into a vector store, answer with an LLM',
    type: 'cloud',
    code: `title RAG Chatbot
direction right

Users [icon: users]

Ingestion [color: blue] {
  Docs Bucket [icon: aws-s3]
  Chunker [icon: scissors]
  Embedder [icon: openai]
}

Vector DB [icon: database, color: purple]

Serving [color: green] {
  Chat API [icon: fastapi]
  Retriever [icon: search]
  LLM [icon: sparkles]
}

Docs Bucket > Chunker > Embedder > Vector DB
Users > Chat API
Chat API > Retriever
Retriever > Vector DB: top k chunks
Retriever > LLM: question + context
LLM --> Chat API: answer with citations`,
  },
  {
    id: 'flow-ml-training',
    category: 'ai',
    title: 'ML Training & Deployment',
    description: 'Data prep, training, evaluation gate and model registry',
    type: 'flowchart',
    code: `title ML Training & Deployment
direction right

Raw data [shape: cylinder, icon: database, color: gray]
Clean and label [icon: tags, color: blue]
Feature engineering [icon: sliders-horizontal, color: blue]
Train model [icon: brain, color: purple]
Evaluate [icon: chart-bar, color: purple]
Beats baseline? [shape: diamond, icon: circle-help, color: yellow]
Tune and retrain [icon: refresh-cw, color: orange]
Register model [icon: archive, color: green]
Canary deploy [icon: rocket, color: green]
Monitor drift [shape: oval, icon: activity, color: teal]

Raw data > Clean and label > Feature engineering > Train model > Evaluate > Beats baseline?
Beats baseline? > Register model: yes
Beats baseline? > Tune and retrain: no
Tune and retrain > Train model
Register model > Canary deploy > Monitor drift
Monitor drift --> Raw data: retrain on drift`,
  },
  {
    id: 'seq-llm-agent',
    category: 'ai',
    title: 'LLM Agent with Tool Calls',
    description: 'The model plans, calls tools, then answers',
    type: 'sequence',
    code: `title LLM Agent with Tool Calls
autoNumber on

User [icon: user, color: gray]
App [icon: app-window, color: blue]
LLM [icon: sparkles, color: purple]
Weather API [icon: cloud-sun, color: teal]
Calendar API [icon: calendar, color: green]

User > App: Should I move tomorrow's run?
App > LLM: Prompt + tool definitions
loop [label: until final answer] {
  LLM --> App: tool_use get_forecast
  App > Weather API: GET forecast
  Weather API --> App: Rain 8am
  App > LLM: tool_result
  LLM --> App: tool_use list_events
  App > Calendar API: GET tomorrow
  Calendar API --> App: Free after 5pm
  App > LLM: tool_result
}
LLM --> App: Move the run to 5:30pm
App --> User: Suggestion + one-click reschedule`,
  },
  {
    id: 'erd-feature-store',
    category: 'ai',
    title: 'Experiment Tracking',
    description: 'Projects, datasets, runs, metrics and model versions',
    type: 'erd',
    code: `title Experiment Tracking

projects [icon: folder, color: blue] {
  id uuid pk
  name varchar
}

datasets [icon: database, color: teal] {
  id uuid pk
  project_id uuid fk
  version varchar
  row_count bigint
}

runs [icon: flask-conical, color: purple] {
  id uuid pk
  project_id uuid fk
  dataset_id uuid fk
  params jsonb
  started_at timestamp
}

metrics [icon: chart-line, color: orange] {
  run_id uuid pk fk
  name varchar pk
  step int pk
  value float
}

model_versions [icon: archive, color: green] {
  id uuid pk
  run_id uuid fk
  stage varchar
  registered_at timestamp
}

datasets.project_id > projects.id
runs.project_id > projects.id
runs.dataset_id > datasets.id
metrics.run_id > runs.id
model_versions.run_id - runs.id`,
  },

  /* -------------------------------------- Security -------------------------------------- */
  {
    id: 'erd-rbac',
    category: 'security',
    title: 'Role-based Access Control',
    description: 'Users, roles, permissions and audit log',
    type: 'erd',
    code: `title Role-based Access Control

users [icon: user, color: blue] {
  id uuid pk
  email varchar unique
  disabled boolean
}

roles [icon: shield, color: purple] {
  id uuid pk
  name varchar unique
}

permissions [icon: key-round, color: orange] {
  id uuid pk
  resource varchar
  action varchar
}

user_roles [icon: link, color: teal] {
  user_id uuid pk fk
  role_id uuid pk fk
}

role_permissions [icon: link, color: teal] {
  role_id uuid pk fk
  permission_id uuid pk fk
}

audit_logs [icon: scroll-text, color: gray] {
  id bigint pk
  actor_id uuid fk
  action varchar
  target varchar
  at timestamp
}

user_roles.user_id > users.id
user_roles.role_id > roles.id
role_permissions.role_id > roles.id
role_permissions.permission_id > permissions.id
audit_logs.actor_id > users.id`,
  },
  {
    id: 'seq-saml-sso',
    category: 'security',
    title: 'SAML Single Sign-On',
    description: 'Service provider initiated login with an identity provider',
    type: 'sequence',
    code: `title SAML Single Sign-On (SP-initiated)

Employee [icon: user, color: gray]
App [icon: app-window, color: blue]
Identity Provider [icon: okta, color: blue]

Employee > App: Open app
App --> Employee: Redirect with SAML AuthnRequest
Employee > Identity Provider: AuthnRequest
Identity Provider > Employee: Login + MFA prompt
Employee > Identity Provider: Credentials + MFA
Identity Provider --> Employee: POST signed SAML Response
Employee > App: SAML Response to ACS URL
activate App
App > App: Verify signature, audience, expiry
App > App: Create session from attributes
App --> Employee: Signed in
deactivate App`,
  },
  {
    id: 'cloud-zero-trust',
    category: 'security',
    title: 'Zero-trust Internal Access',
    description: 'Identity-aware proxy instead of a VPN',
    type: 'cloud',
    code: `title Zero-trust Internal Access
direction right

Employee Laptop [icon: laptop]
Device Posture [icon: shield-check]

Edge [color: purple] {
  Identity Aware Proxy [icon: cloudflare]
  Policy Engine [icon: scale]
}

Identity Provider [icon: okta]

Private Network [color: green] {
  Admin Panel [icon: layout-dashboard]
  Grafana [icon: grafana]
  Internal API [icon: server]
}

Employee Laptop > Identity Aware Proxy
Device Posture > Policy Engine
Identity Aware Proxy > Identity Provider: who is this
Identity Aware Proxy > Policy Engine: allowed?
Identity Aware Proxy > Admin Panel
Identity Aware Proxy > Grafana
Identity Aware Proxy > Internal API`,
  },
  {
    id: 'flow-secret-rotation',
    category: 'security',
    title: 'Secret Rotation',
    description: 'Rotate database credentials with no downtime',
    type: 'flowchart',
    code: `title Database Secret Rotation
direction right

Rotation due [shape: oval, icon: clock, color: gray]
Create new credential [icon: key-round, color: blue]
Store in Vault [icon: vault, color: purple]
Apps reload secret [icon: refresh-cw, color: blue]
All apps on new? [shape: diamond, icon: circle-help, color: yellow]
Wait and retry [icon: hourglass, color: orange]
Revoke old credential [icon: lock, color: green]
Audit log entry [shape: oval, icon: scroll-text, color: gray]

Rotation due > Create new credential > Store in Vault > Apps reload secret > All apps on new?
All apps on new? > Revoke old credential: yes
All apps on new? > Wait and retry: no
Wait and retry > Apps reload secret
Revoke old credential > Audit log entry`,
  },

  /* --------------------------------------- Mobile --------------------------------------- */
  {
    id: 'seq-push-notification',
    category: 'mobile',
    title: 'Push Notification Delivery',
    description: 'Device token registration and sending through FCM/APNs',
    type: 'sequence',
    code: `title Push Notification Delivery

Mobile App [icon: smartphone, color: blue]
Backend [icon: server, color: green]
Queue [icon: rabbitmq, color: orange]
Push Worker [icon: cpu, color: purple]
FCM or APNs [icon: firebase, color: yellow]

Mobile App > FCM or APNs: Register device
FCM or APNs --> Mobile App: device token
Mobile App > Backend: Save token for user
Backend > Queue: notify user 42 "Order shipped"
Queue > Push Worker: job
activate Push Worker
Push Worker > Backend: Load tokens for user 42
Push Worker > FCM or APNs: Send payload
alt [label: token invalid] {
  FCM or APNs --> Push Worker: 410 Unregistered
  Push Worker > Backend: Delete token
}
deactivate Push Worker
FCM or APNs --> Mobile App: Notification shown`,
  },
  {
    id: 'seq-offline-sync',
    category: 'mobile',
    title: 'Offline-first Sync',
    description: 'Queue edits locally, sync and resolve conflicts on reconnect',
    type: 'sequence',
    code: `title Offline-first Sync

App UI [icon: smartphone, color: blue]
Local DB [icon: sqlite, color: teal]
Sync Engine [icon: refresh-cw, color: purple]
Sync API [icon: server, color: green]

App UI > Local DB: Save edit (offline)
Local DB > Sync Engine: Add to outbox
Sync Engine > Sync Engine: Wait for network
loop [label: when online] {
  Sync Engine > Sync API: Push outbox + last sync cursor
  Sync API --> Sync Engine: Server changes + new cursor
  alt [label: conflict] {
    Sync Engine > Sync Engine: Last write wins per field
  }
  Sync Engine > Local DB: Apply changes, clear outbox
}
Local DB --> App UI: Refresh view`,
  },
  {
    id: 'flow-mobile-release',
    category: 'mobile',
    title: 'Mobile App Release',
    description: 'Build, beta test, store review and staged rollout',
    type: 'flowchart',
    code: `title Mobile App Release
direction right

Release branch [shape: oval, icon: git-branch, color: gray]
Build and sign [icon: hammer, color: blue]
Internal beta [icon: users, color: blue]
Crash free? [shape: diamond, icon: circle-help, color: yellow]
Fix bugs [icon: bug, color: red]
Submit to stores [icon: apple, color: purple]
Approved? [shape: diamond, icon: circle-help, color: yellow]
Staged rollout 10 percent [icon: percent, color: green]
Full rollout [shape: oval, icon: rocket, color: green]

Release branch > Build and sign > Internal beta > Crash free?
Crash free? > Submit to stores: yes
Crash free? > Fix bugs: no
Fix bugs > Build and sign
Submit to stores > Approved?
Approved? > Staged rollout 10 percent: yes
Approved? > Fix bugs: rejected
Staged rollout 10 percent > Full rollout`,
  },
  /* ------------------------------------- More templates ------------------------------------- */
  {
    id: 'erd-hr-payroll',
    category: 'database',
    title: 'HR, Attendance & Payroll',
    description: 'Employees, departments, attendance, leave and monthly payslips',
    type: 'erd',
    code: `title HR, Attendance & Payroll

departments [icon: building, color: blue] {
  id uuid pk
  name varchar
  manager_id uuid
}

employees [icon: user, color: blue] {
  id uuid pk
  department_id uuid
  employee_no varchar unique
  full_name varchar
  position varchar
  base_salary decimal
  joined_at date
}

attendance [icon: clock, color: green] {
  id uuid pk
  employee_id uuid
  work_date date
  check_in timestamp
  check_out timestamp
  status varchar
}

leave_requests [icon: calendar, color: yellow] {
  id uuid pk
  employee_id uuid
  approver_id uuid
  kind varchar
  starts_on date
  ends_on date
  status varchar
}

payroll_runs [icon: calendar-check, color: purple] {
  id uuid pk
  period varchar unique
  closed_at timestamp
}

payslips [icon: receipt, color: purple] {
  id uuid pk
  payroll_run_id uuid
  employee_id uuid
  gross decimal
  tax decimal
  deductions decimal
  net decimal
}

employees.department_id > departments.id
departments.manager_id - employees.id
attendance.employee_id > employees.id
leave_requests.employee_id > employees.id
leave_requests.approver_id > employees.id
payslips.payroll_run_id > payroll_runs.id
payslips.employee_id > employees.id`,
  },
  {
    id: 'erd-crm',
    category: 'database',
    title: 'Sales CRM',
    description: 'Accounts, contacts, deals in a pipeline and logged activities',
    type: 'erd',
    code: `title Sales CRM

users [icon: user, color: gray] {
  id uuid pk
  name varchar
  email varchar unique
}

accounts [icon: building, color: blue] {
  id uuid pk
  owner_id uuid
  name varchar
  industry varchar
  website varchar
}

contacts [icon: contact, color: blue] {
  id uuid pk
  account_id uuid
  name varchar
  email varchar
  phone varchar
}

pipeline_stages [icon: list-ordered, color: purple] {
  id uuid pk
  name varchar
  position int
  win_probability int
}

deals [icon: handshake, color: green] {
  id uuid pk
  account_id uuid
  owner_id uuid
  stage_id uuid
  amount decimal
  expected_close date
}

activities [icon: message-square, color: yellow] {
  id uuid pk
  deal_id uuid
  contact_id uuid
  user_id uuid
  kind varchar
  happened_at timestamp
}

accounts.owner_id > users.id
contacts.account_id > accounts.id
deals.account_id > accounts.id
deals.owner_id > users.id
deals.stage_id > pipeline_stages.id
activities.deal_id > deals.id
activities.contact_id > contacts.id
activities.user_id > users.id`,
  },
  {
    id: 'seq-qris-payment',
    category: 'api',
    title: 'QR Code Payment (QRIS)',
    description: 'Dynamic QR at checkout, e-wallet payment and webhook confirmation',
    type: 'sequence',
    code: `title QR Code Payment (QRIS)
autoNumber on

Customer [icon: user, color: gray]
Cashier App [icon: monitor-smartphone, color: blue]
Backend [icon: server, color: green]
Payment Gateway [icon: credit-card, color: purple]
E-wallet App [icon: wallet, color: orange]

Cashier App > Backend: Create order
Backend > Payment Gateway: Create dynamic QR (amount, order id)
Payment Gateway --> Backend: QR string + expiry
Backend --> Cashier App: Show QR
Customer > E-wallet App: Scan QR and confirm
E-wallet App > Payment Gateway: Pay
alt [label: paid before expiry] {
  Payment Gateway > Backend: Webhook payment.succeeded (signed)
  Backend > Backend: Verify signature, mark order paid once
  Backend --> Payment Gateway: 200 OK
  Backend --> Cashier App: Paid, print receipt
}
else [label: QR expired] {
  Backend --> Cashier App: Expired, offer a new QR
}`,
  },
  {
    id: 'seq-idempotent-api',
    category: 'api',
    title: 'Idempotent API Request',
    description: 'Idempotency keys so a retried request is not applied twice',
    type: 'sequence',
    code: `title Idempotent API Request

Client [icon: smartphone, color: blue]
API [icon: server, color: green]
Idempotency Store [icon: redis, color: red]
Database [icon: postgresql, color: blue]

Client > API: POST /transfers (Idempotency-Key: k1)
API > Idempotency Store: Reserve k1
alt [label: new key] {
  Idempotency Store --> API: Reserved
  API > Database: Create transfer
  Database --> API: Transfer 42
  API > Idempotency Store: Save response for k1
  API --> Client: 201 Transfer 42
}
else [label: retry with same key] {
  Idempotency Store --> API: Stored response
  API --> Client: 201 Transfer 42 (replayed)
}
else [label: first request still running] {
  Idempotency Store --> API: In progress
  API --> Client: 409 Retry later
}`,
  },
  {
    id: 'cloud-observability',
    category: 'devops',
    title: 'Observability Stack',
    description: 'OpenTelemetry collector feeding metrics, logs and traces into Grafana',
    type: 'cloud',
    code: `title Observability Stack
direction right

Services [color: blue] {
  API [icon: nodejs]
  Worker [icon: python]
  Web App [icon: react]
}

Collector [icon: opentelemetry, color: purple]

Storage [color: green] {
  Prometheus [icon: prometheus]
  Logs [icon: elasticsearch]
  Traces [icon: jaeger]
}

Grafana [icon: grafana, color: orange]
On-call [icon: pagerduty, color: red]

API, Worker, Web App > Collector: OTLP
Collector > Prometheus: metrics
Collector > Logs: logs
Collector > Traces: traces
Prometheus, Logs, Traces > Grafana
Grafana > On-call: alerts`,
  },
  {
    id: 'flow-support-ticket',
    category: 'product',
    title: 'Support Ticket Lifecycle',
    description: 'Triage, priority, escalation to engineering and closing the loop',
    type: 'flowchart',
    code: `title Support Ticket Lifecycle
direction right

New ticket [shape: oval, icon: inbox, color: gray]
Triage [icon: list-filter, color: blue]
Known issue? [shape: diamond, icon: circle-help, color: yellow]
Reply with fix [icon: message-square, color: green]
Urgent? [shape: diamond, icon: circle-help, color: yellow]
Page on-call [icon: siren, color: red]
Escalate to engineering [icon: bug, color: orange]
Fix shipped [icon: rocket, color: green]
Customer confirms [icon: thumbs-up, color: green]
Closed [shape: oval, icon: check, color: green]

New ticket > Triage > Known issue?
Known issue? > Reply with fix: yes
Known issue? > Urgent?: no
Urgent? > Page on-call: yes
Urgent? > Escalate to engineering: no
Page on-call > Escalate to engineering
Escalate to engineering > Fix shipped > Reply with fix
Reply with fix > Customer confirms > Closed`,
  },
  {
    id: 'flow-etl-pipeline',
    category: 'ai',
    title: 'Batch ETL Pipeline',
    description: 'Extract from sources, validate, transform with dbt and load a warehouse',
    type: 'flowchart',
    code: `title Batch ETL Pipeline
direction right

Sources [color: gray] {
  App DB [icon: postgresql]
  Payments API [icon: stripe]
  CSV uploads [icon: file-spreadsheet]
}

Scheduler [icon: apache-airflow, color: blue]
Raw zone [icon: aws-s3, color: orange]
Valid? [shape: diamond, icon: circle-help, color: yellow]
Quarantine [icon: triangle-alert, color: red]
Transform [icon: dbt, color: purple]
Warehouse [shape: cylinder, icon: snowflake, color: blue]
Dashboards [icon: metabase, color: green]

Scheduler > App DB, Payments API, CSV uploads: extract nightly
App DB, Payments API, CSV uploads > Raw zone
Raw zone > Valid?
Valid? > Transform: yes
Valid? > Quarantine: no
Transform > Warehouse > Dashboards`,
  },
  {
    id: 'seq-biometric-login',
    category: 'mobile',
    title: 'Biometric Login',
    description: 'Face or fingerprint unlocks a device key that signs a server challenge',
    type: 'sequence',
    code: `title Biometric Login

User [icon: user, color: gray]
Mobile App [icon: smartphone, color: blue]
Secure Enclave [icon: fingerprint, color: purple]
Auth API [icon: shield, color: green]

Mobile App > Auth API: Request login challenge
Auth API --> Mobile App: Nonce
Mobile App > User: Prompt Face ID or fingerprint
User > Mobile App: Biometric check
alt [label: matched] {
  Mobile App > Secure Enclave: Sign nonce with device key
  Secure Enclave --> Mobile App: Signature
  Mobile App > Auth API: Device id + signature
  Auth API > Auth API: Verify with stored public key
  Auth API --> Mobile App: Access and refresh tokens
}
else [label: failed three times] {
  Mobile App --> User: Fall back to password
}`,
  },
  {
    id: 'mind-threat-model',
    category: 'security',
    title: 'Threat Model (STRIDE)',
    description: 'STRIDE categories with example threats and mitigations to review',
    type: 'mindmap',
    code: `title Threat Model (STRIDE)

Payment service [icon: shield]
  Spoofing [icon: user-x, color: red]
    Stolen session tokens
    Mitigation: short-lived JWT + MFA
  Tampering [icon: file-warning, color: orange]
    Amount changed in transit
    Mitigation: TLS + signed webhooks
  Repudiation [icon: file-question, color: yellow]
    User denies a transfer
    Mitigation: append-only audit log
  Information disclosure [icon: eye, color: purple]
    Card data in logs
    Mitigation: tokenize and redact
  Denial of service [icon: zap-off, color: blue]
    Checkout flooded by bots
    Mitigation: rate limits + WAF
  Elevation of privilege [icon: key-round, color: green]
    Support role edits balances
    Mitigation: RBAC + four-eyes approval`,
  },
  {
    id: 'mind-sprint-planning',
    category: 'product',
    title: 'Sprint Planning',
    description: 'Goal, committed work, risks and the definition of done for one sprint',
    type: 'mindmap',
    code: `title Sprint Planning

Sprint 14 [icon: calendar]
  Goal [icon: target, color: green]
    Self-serve checkout live
  Committed [icon: list-checks, color: blue]
    QR payment
    Order emails
    Refund button
  Stretch [icon: list-plus, color: gray]
    Saved addresses
  Risks [icon: triangle-alert, color: red]
    Gateway sandbox is unstable
    One engineer on leave
  Definition of done [icon: badge-check, color: purple]
    Tests and review passed
    Feature flag on in staging
    Docs updated`,
  },
]
