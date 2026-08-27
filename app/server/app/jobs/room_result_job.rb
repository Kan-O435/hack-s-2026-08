class RoomResultJob < ApplicationJob
  queue_as :default

  TOP_N = 5
  VOICE_ROAST_TOP_N = 3

  def perform(room_id)
    room = Room.find_by(id: room_id)
    return unless room

    room.participants.find_each do |user|
      utterances = room.utterances.where(user: user)
      total_score = utterances.sum(:cringe_score)
      top_utterances = utterances.order(cringe_score: :desc).limit(TOP_N)

      critique =
        if top_utterances.any? { |u| u.cringe_score.to_i.positive? }
          CringeJudge.harsh_feedback(nickname: user.nickname, total_score: total_score, top_utterances: top_utterances)
        else
          "特に冷笑ポイントはありませんでした。平常運転、お疲れ様です。"
        end

      result = RoomResult.find_or_initialize_by(room: room, user: user)
      result.update!(total_score: total_score, critique: critique)
    end

    dispatch_voice_roasts(room)

    RoomChannel.broadcast_to(room, event: "result_ready")
  end

  private

  # 上位3人だけ音声煽りを生成する。それ以外の参加者の音声サンプルはもう使わないので破棄する
  def dispatch_voice_roasts(room)
    ranked_results = RoomResult.where(room: room).order(total_score: :desc)
    top_results = ranked_results.first(VOICE_ROAST_TOP_N)
    top_user_ids = top_results.map(&:user_id)

    top_results.each { |result| VoiceRoastJob.perform_later(result.id) }

    room.participants.where.not(id: top_user_ids).find_each do |user|
      VoiceSampleStore.cleanup_user(room_id: room.id, user_id: user.id)
    end
  end
end
