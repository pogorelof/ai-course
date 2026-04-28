import { useEffect, useRef, useState } from 'react'
import { CoursesAPI } from '../services/api'
import type { CourseGenerationJobDto } from '../services/api'

const POLL_INTERVAL_MS = 2000

const STATUS_LABEL: Record<CourseGenerationJobDto['status'], string> = {
  pending: 'Ожидает',
  running: 'Генерируется',
  done: 'Готово',
  error: 'Ошибка',
  cancelled: 'Отменено',
}

function isActive(status: CourseGenerationJobDto['status']): boolean {
  return status === 'pending' || status === 'running'
}

function formatPercent(job: CourseGenerationJobDto): number {
  if (!job.total) return 0
  return Math.min(100, Math.round((job.completed / job.total) * 100))
}

export function QueueNotifications() {
  const [jobs, setJobs] = useState<CourseGenerationJobDto[]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const isAuthed = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('access_token'))

  const refresh = async () => {
    if (!isAuthed) return
    try {
      const data = await CoursesAPI.listMyQueues()
      setJobs(data)
    } catch {
      // keep last state
    }
  }

  useEffect(() => {
    if (!isAuthed) return
    refresh()
    intervalRef.current = window.setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed])

  const handleDismiss = (jobId: number) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(jobId)
      return next
    })
  }

  const handleCancel = async (jobId: number) => {
    try {
      const updated = await CoursesAPI.cancelQueueJob(jobId)
      setJobs(prev => prev.map(item => (item.id === updated.id ? updated : item)))
    } catch {
      // ignore
    }
  }

  const visibleJobs = jobs.filter(job => !dismissed.has(job.id))
  if (!isAuthed || visibleJobs.length === 0) return null

  const activeCount = visibleJobs.filter(job => isActive(job.status)).length

  return (
    <div className="queue-toaster" role="status" aria-live="polite">
      <div className="queue-toaster-header">
        <div className="queue-toaster-title">
          Очередь генерации
          <span className="queue-toaster-badge">{activeCount > 0 ? `${activeCount} в работе` : 'все готовы'}</span>
        </div>
        <button
          type="button"
          className="queue-toaster-collapse"
          onClick={() => setCollapsed(prev => !prev)}
          aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
        >
          {collapsed ? '▴' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <div className="queue-toaster-list">
          {visibleJobs.map(job => {
            const percent = formatPercent(job)
            const active = isActive(job.status)
            return (
              <div key={job.id} className={`queue-toast queue-toast--${job.status}`}>
                <div className="queue-toast-row">
                  <span className="queue-toast-course">{job.course_title || `Курс #${job.course_id}`}</span>
                  <span className="queue-toast-status">{STATUS_LABEL[job.status]}</span>
                </div>
                <div className="queue-toast-progress">
                  <div className="queue-toast-progress-bar" style={{ width: `${percent}%` }} />
                </div>
                <div className="queue-toast-row queue-toast-meta">
                  <span>
                    {job.completed} / {job.total} тем
                    {active && job.current_topic_title ? ` · «${job.current_topic_title}»` : ''}
                  </span>
                  <span>{percent}%</span>
                </div>
                {job.error_message && (
                  <div className="queue-toast-error">{job.error_message}</div>
                )}
                <div className="queue-toast-actions">
                  {active ? (
                    <button type="button" className="queue-toast-btn" onClick={() => handleCancel(job.id)}>
                      Отменить
                    </button>
                  ) : (
                    <button type="button" className="queue-toast-btn" onClick={() => handleDismiss(job.id)}>
                      Скрыть
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
