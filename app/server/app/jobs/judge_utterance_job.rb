class JudgeUtteranceJob < ApplicationJob
  queue_as :default

  retry_on Anthropic::Errors::APIStatusError, wait: :polynomially_longer, attempts: 3

  def perform(utterance_id)
    utterance = Utterance.find_by(id: utterance_id)
    return unless utterance

    result = CringeJudge.judge(utterance.transcript)

    utterance.update!(
      sneer_detected: result.sneer_detected,
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
        sneer_detected: utterance.sneer_detected,
        cringe_score: utterance.cringe_score,
        cringe_phrase: utterance.cringe_phrase,
        cringe_reason: utterance.cringe_reason
      }
    }
  end
end
