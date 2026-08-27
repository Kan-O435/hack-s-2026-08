require "test_helper"

class JudgeUtteranceJobTest < ActiveJob::TestCase
  test "persists and broadcasts the dedicated sneer judgment" do
    user = User.create!(nickname: "テストユーザー")
    room = Room.create!(name: "テストルーム", host_user: user)
    utterance = Utterance.create!(
      room: room,
      user: user,
      transcript: "成長って便利な言葉だよね",
      spoken_at: Time.current,
      duration_ms: 1_000
    )
    result = CringeJudge::JudgeResult.new(
      sneer_detected: true,
      cringe_score: 85,
      phrase: "成長って便利な言葉",
      reason: "概念を皮肉っぽく茶化している"
    )
    broadcast = nil

    CringeJudge.stub(:judge, result) do
      RoomChannel.stub(:broadcast_to, ->(_room, payload) { broadcast = payload }) do
        JudgeUtteranceJob.perform_now(utterance.id)
      end
    end

    utterance.reload
    assert utterance.sneer_detected
    assert_equal 85, utterance.cringe_score
    assert_equal "utterance_scored", broadcast[:event]
    assert broadcast.dig(:utterance, :sneer_detected)
  end
end
