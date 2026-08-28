class ExpressionBonusJob < ApplicationJob
  queue_as :default

  retry_on Anthropic::Errors::APIError, wait: :polynomially_longer, attempts: 3 do |job, error|
    utterance = Utterance.find_by(id: job.arguments.first)
    next unless utterance

    Rails.logger.error("ExpressionBonusJob failed permanently for utterance=#{utterance.id}: #{error.message}")
  end

  def perform(utterance_id)
    utterance = Utterance.find_by(id: utterance_id)
    return unless utterance&.sneer_photo&.attached?

    phrase = utterance.cringe_phrase.presence || utterance.transcript
    result = CringeJudge.judge_expression(
      image_bytes: utterance.sneer_photo.download,
      content_type: utterance.sneer_photo.blob.content_type,
      phrase: phrase
    )

    utterance.update!(expression_bonus: result.bonus, expression_comment: result.comment)
  end
end
