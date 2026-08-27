class JudgeUtteranceJob < ApplicationJob
  queue_as :default

  # APIStatusError(429等)だけでなく、APIConnectionError/APITimeoutError(回線の瞬断)も
  # 同じAPIErrorの子孫なので、親クラスで指定してどちらもリトライ対象にする
  retry_on Anthropic::Errors::APIError, wait: :polynomially_longer, attempts: 3 do |job, error|
    utterance = Utterance.find_by(id: job.arguments.first)
    next unless utterance

    # cringe_scoreはnilのままにする(フロントは未判定をscore=0と同じ扱いにしているため、
    # 見た目上は「冷笑なし」と区別なく表示されるだけで済む)。運用側が気づけるようログにだけ残す
    Rails.logger.error("JudgeUtteranceJob failed permanently for utterance=#{utterance.id}: #{error.message}")
  end

  def perform(utterance_id)
    utterance = Utterance.find_by(id: utterance_id)
    return unless utterance

    result = CringeJudge.judge(utterance.transcript)

    utterance.update!(
      cringe_score: result.cringe_score,
      cringe_phrase: result.phrase,
      cringe_reason: result.reason
    )

    RoomChannel.broadcast_to(utterance.room, utterance_scored_payload(utterance))
  end

  private

  def utterance_scored_payload(utterance)
    {
      event: "utterance_scored",
      utterance: {
        id: utterance.id,
        room_id: utterance.room_id,
        user_id: utterance.user_id,
        nickname: utterance.user.nickname,
        transcript: utterance.transcript,
        spoken_at: utterance.spoken_at,
        cringe_score: utterance.cringe_score,
        cringe_phrase: utterance.cringe_phrase,
        cringe_reason: utterance.cringe_reason
      }
    }
  end
end
