class RoomResultJob < ApplicationJob
  queue_as :default

  TOP_N = 5

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

    RoomChannel.broadcast_to(room, event: "result_ready")
  end
end
