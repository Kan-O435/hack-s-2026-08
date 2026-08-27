class RoomChannel < ApplicationCable::Channel
  def subscribed
    room = Room.find_by(id: params[:room_id])
    return reject unless room
    return reject unless room.room_participants.exists?(user: current_user)

    stream_for room
  end
end
