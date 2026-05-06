export type Person = {
  id: string
  name: string
  slack_user_id: string | null
  email: string
  access_token: string
  reports_daily: boolean
  receives_reports: boolean
  created_at: string
}

export type PlannedItem = {
  id: string
  date: string
  person_id: string
  raw_text: string
  source: 'manual' | 'sheet_sync'
  created_at: string
}

export type Execution = {
  id: string
  date: string
  person_id: string
  planned_item_id: string | null
  status: 'feito' | 'parcial' | 'nao_feito' | 'extra'
  notes: string | null
  created_at: string
}

export type Project = {
  id: string
  name: string
  status: 'em_andamento' | 'atrasado' | 'concluido' | 'pausado'
  target_end_date: string | null
  created_at: string
}

export type DailyReport = {
  id: string
  date: string
  kind: 'boletim_manha' | 'fechamento_dia'
  content_html: string | null
  sent_to_slack: boolean
  sent_to_email: boolean
  sent_at: string | null
  created_at: string
}
