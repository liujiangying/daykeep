import { request } from '@/api/request'

export interface QuizQuestion {
  id: string
  text: string
  options: string[]
}

export interface QuizResult {
  id: string
  spaceId: string
  score: number
  summary: string
}

export interface QuizSession {
  id: string
  spaceId: string
  createdBy: string
  questions: QuizQuestion[]
  /** answering：圈里还有人没答完；completed：成员都答完并已结算 */
  status: 'answering' | 'completed'
  /** 已完整作答的成员 userId 列表 */
  answeredBy: string[]
  memberCount: number
  answeredCount: number
  result?: QuizResult
}

/**
 * 读这个圈子当前这一场：进行中的接着答，刚结算完的把结果读回来。
 * 没有任何记录时返回 null。进入页面必须先走这里，
 * 直接 createQuiz 会让大家各自开一场，谁都等不到别人的答案。
 */
export async function getCurrentQuiz(spaceId: string): Promise<QuizSession | null> {
  const res = await request<{ quiz: QuizSession | null }>({
    url: `/api/quizzes/current?spaceId=${encodeURIComponent(spaceId)}`,
  })
  return res?.quiz || null
}

/**
 * 发起测试。服务端是「取已有未完成场次，没有才新建」，
 * 因此重复调用不会产生第二场测试。
 */
export function createQuiz(spaceId: string): Promise<QuizSession> {
  return request<QuizSession>({
    url: '/api/quizzes',
    method: 'POST',
    data: { spaceId },
  })
}

/** 提交「我」这一份答案，返回更新后的测试状态（可能仍在等其他人作答）。 */
export function submitQuizAnswers(
  session: QuizSession,
  answers: Record<string, string>,
): Promise<QuizSession> {
  return request<QuizSession>({
    url: `/api/quizzes/${encodeURIComponent(session.id)}/finish`,
    method: 'POST',
    data: { answers },
  })
}
