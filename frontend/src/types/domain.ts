export type Course = {
  id: number
  title: string
}

export type Topic = {
  id: number
  title: string
}

export type GeneratedTopic = {
  course_title: string
  course_id: number
  topic_id: number
  content: string
}

export type AuthState = {
  isAuthenticated: boolean
  username: string | null
  token: string | null
}


