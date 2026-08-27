module Api
  module V1
    class RoomsController < ApplicationController
      before_action :authenticate_user!

      def create
        room = Room.new(
          name: params[:name].presence || "#{current_user.nickname}の妄想会",
          host_user: current_user
        )

        if room.save
          room.room_participants.create!(user: current_user, joined_at: Time.current)
          render json: room_json(room), status: :created
        else
          render_error("invalid_room", room.errors.full_messages.join(", "), :unprocessable_entity)
        end
      end

      def join
        room = Room.find_by(passcode: params[:passcode])
        return render_error("invalid_passcode", "パスコードが見つかりません", :not_found) unless room
        return render_error("room_not_joinable", "このルームは参加を締め切っています", :conflict) unless room.waiting?

        already_joined = room.room_participants.exists?(user: current_user)
        if !already_joined && room.room_participants.count >= Room::MAX_PARTICIPANTS
          return render_error(
            "room_full", "このルームは満員です(最大#{Room::MAX_PARTICIPANTS}人)", :conflict
          )
        end

        room.room_participants.find_or_create_by!(user: current_user) do |p|
          p.joined_at = Time.current
        end

        render json: room_json(room)
      end

      def show
        room = Room.find_by(id: params[:id])
        return render_error("not_found", "ルームが見つかりません", :not_found) unless room
        unless room.room_participants.exists?(user: current_user)
          return render_error("forbidden", "このルームの参加者ではありません", :forbidden)
        end

        render json: room_json(room)
      end

      def start
        room = Room.find_by(id: params[:id])
        return render_error("not_found", "ルームが見つかりません", :not_found) unless room
        return render_error("forbidden", "ホストのみ操作できます", :forbidden) unless room.host_user_id == current_user.id
        return render_error("invalid_state", "このルームは開始できません", :conflict) unless room.waiting?

        room.update!(status: :in_progress, started_at: Time.current)
        render json: room_json(room)
      end

      def finish
        room = Room.find_by(id: params[:id])
        return render_error("not_found", "ルームが見つかりません", :not_found) unless room
        return render_error("forbidden", "ホストのみ操作できます", :forbidden) unless room.host_user_id == current_user.id
        return render_error("invalid_state", "このルームは終了できません", :conflict) unless room.in_progress?

        room.update!(status: :finished, finished_at: Time.current)
        RoomChannel.broadcast_to(room, event: "room_finished", finished_at: room.finished_at)
        # 発話ごとの判定ジョブが追いつく時間を少し確保してから集計する
        RoomResultJob.set(wait: 5.seconds).perform_later(room.id)

        render json: room_json(room)
      end

      def result
        room = Room.find_by(id: params[:id])
        return render_error("not_found", "ルームが見つかりません", :not_found) unless room
        unless room.room_participants.exists?(user: current_user)
          return render_error("forbidden", "このルームの参加者ではありません", :forbidden)
        end

        results = RoomResult.where(room: room).includes(:user)
        return render json: { status: "processing" } if results.empty?

        render json: {
          status: "ready",
          room: { id: room.id, name: room.name },
          results: results.order(total_score: :desc).map { |r| result_json(room, r) }
        }
      end

      def voice_roast
        room = Room.find_by(id: params[:id])
        return render_error("not_found", "ルームが見つかりません", :not_found) unless room
        unless room.room_participants.exists?(user: current_user)
          return render_error("forbidden", "このルームの参加者ではありません", :forbidden)
        end

        result = RoomResult.find_by(room: room, user_id: params[:user_id])
        unless result&.ready? && File.exist?(result.voice_roast_path)
          return render_error("not_found", "音声はまだ用意できていません", :not_found)
        end

        send_file result.voice_roast_path, type: "audio/mpeg", disposition: "inline"
      end

      private

      def result_json(room, result)
        # cringe_scoreがnilなのはまだ判定ジョブが終わっていない発話(文字起こし中プレースホルダ含む)なので除外する
        top_lines = room.utterances
          .where(user: result.user)
          .where.not(cringe_score: nil)
          .order(cringe_score: :desc)
          .limit(RoomResultJob::TOP_N)

        {
          user_id: result.user_id,
          nickname: result.user.nickname,
          total_score: result.total_score,
          critique: result.critique,
          voice_roast_status: result.voice_roast_status,
          top_lines: top_lines.map do |u|
            { phrase: u.cringe_phrase.presence || u.transcript, score: u.cringe_score.to_i, reason: u.cringe_reason }
          end
        }
      end

      def room_json(room)
        {
          room: {
            id: room.id,
            name: room.name,
            passcode: room.passcode,
            status: room.status,
            host_user_id: room.host_user_id,
            max_participants: Room::MAX_PARTICIPANTS
          },
          participants: room.room_participants.includes(:user).order(:joined_at).map do |p|
            { user_id: p.user_id, nickname: p.user.nickname, joined_at: p.joined_at }
          end
        }
      end
    end
  end
end
