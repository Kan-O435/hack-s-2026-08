require "test_helper"

class CringeJudgeTest < ActiveSupport::TestCase
  FakeContentBlock = Struct.new(:type, :input, keyword_init: true)
  FakeMessage = Struct.new(:content, keyword_init: true)

  test "marks a forced trigger as a sneer" do
    result = CringeJudge.judge("それはきちー")

    assert result.sneer_detected
    assert_equal 120, result.cringe_score
  end

  test "uses the dedicated sneer flag independently from the cringe score" do
    response = FakeMessage.new(content: [
      FakeContentBlock.new(
        type: :tool_use,
        input: {
          sneer_detected: false,
          cringe_score: 70,
          phrase: "いつか世界を変える",
          reason: "現実から距離のある表現"
        }
      )
    ])
    messages = Object.new
    messages.define_singleton_method(:create) { |**| response }
    client = Struct.new(:messages).new(messages)

    result = CringeJudge.stub(:client, client) do
      CringeJudge.judge("いつか世界を変える")
    end

    assert_not result.sneer_detected
    assert_equal 70, result.cringe_score
  end

  test "defaults to a non-sneer result when the tool response is missing" do
    response = FakeMessage.new(content: [])
    messages = Object.new
    messages.define_singleton_method(:create) { |**| response }
    client = Struct.new(:messages).new(messages)

    result = CringeJudge.stub(:client, client) do
      CringeJudge.judge("今日は晴れですね")
    end

    assert_not result.sneer_detected
    assert_equal 0, result.cringe_score
  end

  test "does not mark a zero-score response as a sneer" do
    response = FakeMessage.new(content: [
      FakeContentBlock.new(
        type: :tool_use,
        input: { sneer_detected: true, cringe_score: 0, phrase: "", reason: "" }
      )
    ])
    messages = Object.new
    messages.define_singleton_method(:create) { |**| response }
    client = Struct.new(:messages).new(messages)

    result = CringeJudge.stub(:client, client) do
      CringeJudge.judge("今日は晴れですね")
    end

    assert_not result.sneer_detected
  end
end
