require "test_helper"
require "stringio"

class Api::V1::MeSneerCardsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @viewer = User.create!(nickname: "閲覧者")
    @speaker = User.create!(nickname: "冷笑した人")
    @room = Room.create!(name: "参加済みルーム", host_user: @viewer)
    @room.room_participants.create!(user: @viewer, joined_at: Time.current)
    @room.room_participants.create!(user: @speaker, joined_at: Time.current)
  end

  # ニックネームだけの簡易ログインでアカウントの概念が薄いため、図鑑は参加ルームに絞らず
  # 全員分を共有する(履歴と同じ方針。me_controller.rb#sneer_cards参照)
  test "returns all attached sneer cards regardless of room membership" do
    older = create_card(room: @room, user: @speaker, captured_at: 2.minutes.ago, transcript: "古い冷笑")
    newer = create_card(room: @room, user: @speaker, captured_at: 1.minute.ago, transcript: "新しい冷笑")
    unjoined = create_card(room: unjoined_room, user: @speaker, captured_at: Time.current, transcript: "未参加ルームの冷笑")
    create_utterance(room: @room, user: @speaker, sneer_detected: true, transcript: "写真なし")
    create_card(room: @room, user: @speaker, captured_at: Time.current, transcript: "非冷笑", sneer_detected: false)

    get "/api/v1/me/sneer_cards", params: { page: 1, per_page: 2 }, headers: auth_headers(@viewer)

    assert_response :ok
    body = response.parsed_body
    assert_equal 3, body.dig("pagination", "total_count")
    assert_equal 2, body.dig("pagination", "total_pages")
    assert_equal [ unjoined.id, newer.id ], body.fetch("cards").pluck("id")

    card = body.fetch("cards").first
    assert_equal @speaker.nickname, card.dig("speaker", "nickname")
    assert_equal "未参加ルームの冷笑", card.dig("utterance", "transcript")
    assert_equal unjoined_room.name, card.dig("room", "name")
    assert_match %r{\Ahttp://www\.example\.com/rails/active_storage/}, card.fetch("photo_url")

    get "/api/v1/me/sneer_cards", params: { page: 2, per_page: 2 }, headers: auth_headers(@viewer)

    assert_equal [ older.id ], response.parsed_body.fetch("cards").pluck("id")
  end

  test "requires authentication" do
    get "/api/v1/me/sneer_cards"

    assert_response :unauthorized
  end

  private

  def create_card(room:, user:, captured_at:, transcript:, sneer_detected: true)
    utterance = create_utterance(
      room: room,
      user: user,
      sneer_detected: sneer_detected,
      transcript: transcript
    )
    utterance.snapshot_captured_at = captured_at
    utterance.sneer_photo.attach(
      io: StringIO.new("webp"),
      filename: "sneer.webp",
      content_type: "image/webp",
      identify: false
    )
    utterance.save!
    utterance
  end

  def create_utterance(room:, user:, sneer_detected:, transcript:)
    Utterance.create!(
      room: room,
      user: user,
      transcript: transcript,
      spoken_at: Time.current,
      duration_ms: 1_000,
      sneer_detected: sneer_detected,
      cringe_score: sneer_detected ? 80 : 0,
      cringe_phrase: sneer_detected ? transcript : nil,
      cringe_reason: sneer_detected ? "皮肉っぽく茶化している" : nil
    )
  end

  def unjoined_room
    @unjoined_room ||= Room.create!(name: "未参加ルーム", host_user: @speaker)
  end

  def auth_headers(user)
    { "Authorization" => "Bearer #{user.device_token}" }
  end
end
