# Example image for run_planner.py: commonroad-reactive-planner, the official
# checker and drawtonomy-commonroad in one place.
#
#   docker build --platform linux/amd64 -t cr-planner .
#   docker run --rm --platform linux/amd64 -v "$PWD:/work" cr-planner \
#       python3 /opt/reactive_planner/run_planner.py /work/scenario.xml /work/out
#
# linux/amd64 because commonroad-drivability-checker and commonroad-clcs publish
# manylinux_x86_64 wheels only; --only-binary keeps pip on those wheels.
FROM --platform=linux/amd64 python:3.11-slim

RUN pip install --no-cache-dir --progress-bar off \
        --only-binary=commonroad-drivability-checker,commonroad-clcs \
        commonroad-io \
        commonroad-drivability-checker \
        commonroad-reactive-planner \
        commonroad-route-planner \
        imageio \
        shapely \
        matplotlib

RUN pip install --no-cache-dir --progress-bar off drawtonomy-commonroad

COPY run_planner.py /opt/reactive_planner/run_planner.py
WORKDIR /work
