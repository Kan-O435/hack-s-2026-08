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

      private

      def room_json(room)
        {
          room: {
            id: room.id,
            name: room.name,
            passcode: room.passcode,
            status: room.status,
            host_user_id: room.host_user_id
          },
          participants: room.room_participants.includes(:user).order(:joined_at).map do |p|
            { user_id: p.user_id, nickname: p.user.nickname, joined_at: p.joined_at }
          end
        }
      end
    end
  end
end
